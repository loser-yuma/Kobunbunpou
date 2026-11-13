const panel = document.querySelector('#quiz');
const home = document.querySelector('#home');
const quizView = document.querySelector('#quiz-view');
const tabs = [...document.querySelectorAll('.tab')];
const courseCards = [...document.querySelectorAll('.course-card')];
const QUESTION_COUNT = 10;
const STATS_KEY = 'kobun-quiz-stats';
const DAILY_KEY = 'kobunbunpou-daily-counts';
const authMessage = document.querySelector('#auth-message');
const validCategories = ['particles', 'auxiliaries'];
let kind = 'particles';
let index = 0;
let score = 0;
let answered = false;
let sessionQuestions = [];
let attemptId = null;
let pendingAnswers = [];
let currentProfile = null;
let supabaseClient = null;
let anonymousSessionPromise = null;

const totalQuestions = Object.values(quizzes).reduce((total, questions) => total + questions.length, 0);
document.querySelector('#total-count').textContent = `${totalQuestions}問`;
courseCards.forEach(card => {
	card.querySelector('.course-meta').textContent = `全${quizzes[card.dataset.startKind].length}問から10問出題`;
});
tabs.forEach(tab => {
	tab.textContent = tab.dataset.kind === 'particles' ? '助詞（10問）' : '助動詞（10問）';
});

function createEmptyStats() {
	return { best: { particles: 0, auxiliaries: 0 } };
}

function isValidStats(value) {
	return value &&
		value.best &&
		Number.isInteger(value.best.particles) && value.best.particles >= 0 && value.best.particles <= QUESTION_COUNT &&
		Number.isInteger(value.best.auxiliaries) && value.best.auxiliaries >= 0 && value.best.auxiliaries <= QUESTION_COUNT;
}

function showStorageError(action, error) {
	const message = document.querySelector('#storage-message');
	message.hidden = false;
	message.textContent = `最高記録の${action}に失敗しました。ブラウザーの保存設定をご確認ください。`;
	console.error(`クイズ最高記録の${action}に失敗しました。`, error);
}

function loadStats() {
	try {
		const saved = localStorage.getItem(STATS_KEY);
		if (saved === null) return createEmptyStats();
		const parsed = JSON.parse(saved);
		if (isValidStats(parsed)) return parsed;
		showStorageError('読み込み', new Error('保存データの形式が正しくありません'));
	} catch (error) {
		showStorageError('読み込み', error);
	}
	return createEmptyStats();
}

const stats = loadStats();

// ===== ポータル連携用：日別の回答数（日本時間の日付ごと。1問答えるたびに+1） =====
let dailyMemory = {};

function jstDay(ms) {
	return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function loadDailyCounts() {
	try {
		const parsed = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
	} catch (error) {
		return { ...dailyMemory };
	}
	return {};
}

function recordAnswer({ sync = true } = {}) {
	const days = loadDailyCounts();
	const today = jstDay(Date.now());
	days[today] = (Number.isInteger(days[today]) && days[today] >= 0 ? days[today] : 0) + 1;
	Object.keys(days).sort().slice(0, -400).forEach(day => { delete days[day]; });
	dailyMemory = days;
	try {
		localStorage.setItem(DAILY_KEY, JSON.stringify(days));
	} catch (error) {
		console.error('日別の回答数を保存できませんでした。', error);
	}
	if (sync && window.PortalClient) window.PortalClient.kick();
}

function renderStats() {
	document.querySelectorAll('[data-best-kind]').forEach(record => {
		record.textContent = `${stats.best[record.dataset.bestKind]} / ${QUESTION_COUNT}問`;
	});
	document.querySelector('#cumulative-count').textContent =
		currentProfile ? `${currentProfile.cumulative_correct}問` : '--問';
	document.querySelector('#streak-count').textContent =
		currentProfile ? `${currentProfile.current_streak}日` : '--日';
}

function saveStats() {
	try {
		localStorage.setItem(STATS_KEY, JSON.stringify(stats));
		document.querySelector('#storage-message').hidden = true;
	} catch (error) {
		showStorageError('保存', error);
	}
}

function setAuthMessage(message, isError = false) {
	authMessage.textContent = message;
	authMessage.classList.toggle('error', isError);
}

function setRankingMessage(message) {
	for (const id of ['correct-ranking', 'streak-ranking']) {
		const list = document.querySelector(`#${id}`);
		list.replaceChildren();
		const item = document.createElement('li');
		item.textContent = message;
		list.append(item);
	}
}

function renderRanking(listId, entries, scoreField, suffix) {
	const list = document.querySelector(`#${listId}`);
	list.replaceChildren();
	if (!entries.length) {
		const item = document.createElement('li');
		item.textContent = 'まだ記録がありません';
		list.append(item);
		return;
	}
	entries.forEach(entry => {
		const item = document.createElement('li');
		const name = document.createElement('span');
		name.textContent = entry.nickname;
		const scoreText = document.createElement('span');
		scoreText.className = 'rank-score';
		scoreText.textContent = `${entry[scoreField]}${suffix}`;
		item.append(name, scoreText);
		list.append(item);
	});
}

function renderDashboard(data) {
	currentProfile = data.profile;
	document.querySelector('#cumulative-count').textContent = `${currentProfile.cumulative_correct}問`;
	document.querySelector('#streak-count').textContent = `${currentProfile.current_streak}日`;
	document.querySelector('#account-nickname').textContent = currentProfile.nickname
		? `ニックネーム: ${currentProfile.nickname}`
		: 'ニックネーム未登録';
	document.querySelector('#nickname-form').hidden = Boolean(currentProfile.nickname);
	document.querySelector('#nickname-form [name="nickname"]').value =
		currentProfile.nickname || currentProfile.suggested_nickname || '';
	renderRanking('correct-ranking', data.leaderboards.correct, 'cumulative_correct', '問');
	renderRanking('streak-ranking', data.leaderboards.streak, 'current_streak', '日');
	renderStats();
}

async function callApi(action, parameters = {}) {
	const { data, error } = await supabaseClient.functions.invoke('quiz-api', {
		body: { action, ...parameters }
	});
	if (error) {
		const responseMessage = error.context && typeof error.context.json === 'function'
			? await error.context.json().catch(() => null)
			: null;
		throw new Error(responseMessage?.error || error.message || 'サーバーとの通信に失敗しました。');
	}
	if (!data || data.error) throw new Error(data?.error || 'サーバーから有効な応答がありません。');
	return data;
}

async function loadDashboard() {
	const data = await callApi('profile');
	renderDashboard(data);
}

async function loadLeaderboards() {
	const leaderboards = await callApi('leaderboard');
	renderRanking('correct-ranking', leaderboards.correct, 'cumulative_correct', '問');
	renderRanking('streak-ranking', leaderboards.streak, 'current_streak', '日');
}

async function handleSession(session) {
	const hasSession = Boolean(session?.user);
	const isAnonymous = Boolean(session?.user?.is_anonymous);
	document.querySelector('#auth-forms').hidden = hasSession;
	document.querySelector('#account-session').hidden = !hasSession;
	document.querySelector('#logout-button').hidden = !hasSession;
	if (isAnonymous) {
		currentProfile = null;
		document.querySelector('#auth-forms').hidden = false;
		document.querySelector('#account-session').hidden = true;
		renderStats();
		setAuthMessage('ログインなしでクイズを利用できます。ランキングに参加する場合は登録またはログインしてください。');
		return;
	}
	if (!hasSession) {
		currentProfile = null;
		document.querySelector('#account-email').textContent = '';
		document.querySelector('#account-nickname').textContent = '';
		renderStats();
		if (supabaseClient) {
			try {
				await loadLeaderboards();
			} catch (error) {
				setRankingMessage(`ランキングを読み込めませんでした: ${error.message}`);
			}
		} else {
			setRankingMessage('Supabase接続設定後にランキングを表示します');
		}
		return;
	}
	document.querySelector('#account-email').textContent = session.user.email || '';
	setAuthMessage('アカウント情報を読み込んでいます。');
	try {
		await loadDashboard();
		if (!currentProfile.nickname && session.user.user_metadata?.nickname) {
			try {
				await callApi('set_nickname', { nickname: session.user.user_metadata.nickname });
				await loadDashboard();
			} catch (error) {
				setAuthMessage(`ニックネームを登録できませんでした: ${error.message}`, true);
				return;
			}
		}

		setAuthMessage(currentProfile.nickname
			? 'ログイン中です。クイズを完了すると記録がランキングに反映されます。'
			: 'ランキング参加にはニックネームを登録してください。');
	} catch (error) {
		setAuthMessage(`アカウント情報を取得できませんでした: ${error.message}`, true);
		setRankingMessage('ランキングを読み込めませんでした');
	}
}

async function ensureQuizSession() {
	if (!supabaseClient) throw new Error('Supabaseの設定が必要です。');
	const { data, error } = await supabaseClient.auth.getSession();
	if (error) throw error;
	if (data.session?.user) return;
	if (!anonymousSessionPromise) {
		anonymousSessionPromise = supabaseClient.auth.signInAnonymously()
			.then(({ data: signInData, error: signInError }) => {
				if (signInError) throw signInError;
				if (!signInData.session) throw new Error('匿名セッションを開始できませんでした。');
				return signInData.session;
			})
			.finally(() => { anonymousSessionPromise = null; });
	}
	await anonymousSessionPromise;
}

async function ensureQuizNickname() {
	if (currentProfile?.nickname) return;
	const { data, error } = await supabaseClient.auth.getSession();
	if (error) throw error;
	const userId = data.session?.user?.id;
	if (!userId) throw new Error('クイズ用セッションがありません。');
	const nickname = `guest-${userId.replaceAll('-', '').slice(0, 12)}`;
	await callApi('set_nickname', { nickname });
	currentProfile = { ...(currentProfile || {}), nickname };
}

function shuffle(items) {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

function prepareQuestion(question, sourceIndex) {
	const choiceOrder = shuffle(question.choices.map((_, originalIndex) => originalIndex));
	return {
		...question,
		sourceIndex,
		choiceOrder,
		choices: choiceOrder.map(originalIndex => question.choices[originalIndex])
	};
}

function render() {
	if (index >= sessionQuestions.length) {
		stats.best[kind] = Math.max(stats.best[kind], score);
		saveStats();
		panel.innerHTML = `<div class="result"><h2>おつかれさまでした！</h2><p>${kind === 'particles' ? '助詞' : '助動詞'}のクイズが終了しました。</p><div class="score">${score} / ${QUESTION_COUNT} 問正解</div><p>このテーマの最高記録：${stats.best[kind]} / ${QUESTION_COUNT} 問</p><p>累計正解数：${currentProfile?.cumulative_correct ?? '--'}問</p><p>連続学習：${currentProfile?.current_streak ?? '--'}日</p><button class="primary" id="restart">もう一度挑戦</button></div>`;
		document.querySelector('#restart').addEventListener('click', startOver);
		return;
	}
	const question = sessionQuestions[index];
	const highlighted = question.sentence.replace(question.target, `<span class="blank">${question.target}</span>`);
	panel.innerHTML = `<div class="progress-row"><span>第 ${index + 1} 問 / ${QUESTION_COUNT} 問</span><span>今回の正解 ${score} 問</span></div>
		<div class="track"><div class="bar" style="width:${(index / QUESTION_COUNT) * 100}%"></div></div>
		<h2 class="question">${question.ask}</h2><p class="sentence">「${highlighted}」</p>
		<div class="choices">${question.choices.map((choice, i) => `<button class="choice" data-choice="${i}">${String.fromCharCode(65 + i)}. ${choice}</button>`).join('')}</div>
		<p class="feedback" id="feedback"></p>`;
	panel.querySelectorAll('.choice').forEach(button => button.addEventListener('click', () => selectAnswer(Number(button.dataset.choice))));
}

async function submitAnswers() {
	const selectedIndices = pendingAnswers.map(answer => answer.selected_index);
	panel.innerHTML = '<p class="feedback">回答をまとめて確認しています…</p>';
	try {
		let result;
		try {
			result = await callApi('answer_batch', {
				attempt_id: attemptId,
				selected_indices: selectedIndices
			});
		} catch (error) {
			if (error.message !== '指定された操作に対応していません。') throw error;
			const answers = [];
			for (let position = 0; position < selectedIndices.length; position++) {
				answers.push(await callApi('answer', {
					attempt_id: attemptId,
					expected_position: position,
					selected_index: selectedIndices[position]
				}));
			}
			result = { answers, final: answers[answers.length - 1] };
		}
		const answers = Array.isArray(result.answers) ? result.answers : [];
		answers.forEach(answer => {
			if (answer.correct) score++;
			recordAnswer({ sync: false });
		});
		if (window.PortalClient) window.PortalClient.kick();
		score = result.final?.score ?? score;
		if (result.final) {
			currentProfile = {
				...currentProfile,
				cumulative_correct: result.final.cumulative_correct,
				current_streak: result.final.current_streak
			};
		}
		if (result.final?.is_complete) {
			try {
				await loadDashboard();
			} catch (error) {
				setAuthMessage(`ランキングの更新を取得できませんでした: ${error.message}`, true);
			}
		}
		index = QUESTION_COUNT;
		render();
	} catch (error) {
		panel.innerHTML = '';
		const message = document.createElement('p');
		message.className = 'feedback error';
		message.textContent = `回答を送信できませんでした: ${error.message} もう一度お試しください。`;
		panel.append(message);
	}
}

function selectAnswer(selected) {
	if (answered) return;
	answered = true;
	const question = sessionQuestions[index];
	const buttons = panel.querySelectorAll('.choice');
	buttons.forEach(button => { button.disabled = true; });
	pendingAnswers[index] = { selected_index: question.choiceOrder[selected] };
	setTimeout(() => {
		if (index === QUESTION_COUNT - 1) {
			submitAnswers();
			return;
		}
		index++;
		answered = false;
		render();
	}, 250);
}

async function startOver() {
	index = 0;
	score = 0;
	answered = false;
	pendingAnswers = [];
	document.querySelector('#restart')?.setAttribute('disabled', '');
	panel.innerHTML = '<p class="feedback">問題を準備しています…</p>';
	try {
		let attempt;
		try {
			attempt = await callApi('start', { category: kind });
		} catch (error) {
			if (!error.message.includes('ニックネーム')) throw error;
			await ensureQuizNickname();
			attempt = await callApi('start', { category: kind });
		}
		if (!Array.isArray(attempt.question_indices) || attempt.question_indices.length !== QUESTION_COUNT ||
			attempt.question_indices.some(questionIndex =>
				!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= quizzes[kind].length
			)) {
			throw new Error('出題データが正しくありません。');
		}
		attemptId = attempt.attempt_id;
		sessionQuestions = attempt.question_indices.map(questionIndex =>
			prepareQuestion(quizzes[kind][questionIndex], questionIndex)
		);
		render();
	} catch (error) {
		panel.innerHTML = '';
		const message = document.createElement('p');
		message.className = 'feedback error';
		message.textContent = `クイズを開始できませんでした: ${error.message}`;
		panel.append(message);
	}
}

async function showQuiz(selectedKind) {
	if (!validCategories.includes(selectedKind)) return;
	if (!supabaseClient) {
		setAuthMessage('クイズを始めるには、Supabaseの設定が必要です。', true);
		return;
	}
	try {
		await ensureQuizSession();
	} catch (error) {
		setAuthMessage(`クイズを開始できませんでした。ログインなしの利用が有効になっていない可能性があります: ${error.message}`, true);
		document.querySelector('#account-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
		return;
	}
	kind = selectedKind;
	tabs.forEach(tab => {
		const active = tab.dataset.kind === kind;
		tab.classList.toggle('active', active);
		tab.setAttribute('aria-pressed', String(active));
	});
	home.hidden = true;
	quizView.hidden = false;
	await startOver();
}

function showHome() {
	quizView.hidden = true;
	home.hidden = false;
}

document.querySelector('#signup-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (!supabaseClient) return;
	const values = new FormData(event.currentTarget);
	const nickname = String(values.get('nickname')).trim();
	const email = String(values.get('email')).trim();
	const password = String(values.get('password'));
	setAuthMessage('アカウントを作成しています。');
	try {
		const { data, error } = await supabaseClient.auth.signUp({
			email,
			password,
			options: {
				data: { nickname },
				emailRedirectTo: new URL(window.location.pathname, window.location.origin).toString()
			}
		});
		if (error) throw error;
		if (data.session) {
			await callApi('set_nickname', { nickname });
			await handleSession(data.session);
			setAuthMessage('アカウントを作成しました。');
		} else {
			setAuthMessage('確認メールを送りました。メール内のリンクで認証後、ログインしてください。');
		}
	} catch (error) {
		setAuthMessage(`登録できませんでした: ${error.message}`, true);
	}
});

document.querySelector('#login-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (!supabaseClient) return;
	const values = new FormData(event.currentTarget);
	setAuthMessage('ログインしています。');
	try {
		const { data, error } = await supabaseClient.auth.signInWithPassword({
			email: String(values.get('email')).trim(),
			password: String(values.get('password'))
		});
		if (error) throw error;
		await handleSession(data.session);
	} catch (error) {
		setAuthMessage(`ログインできませんでした: ${error.message}`, true);
	}
});

document.querySelector('#nickname-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (!supabaseClient) return;
	const nickname = String(new FormData(event.currentTarget).get('nickname')).trim();
	setAuthMessage('ニックネームを保存しています。');
	try {
		await callApi('set_nickname', { nickname });
		await loadDashboard();
		setAuthMessage('ニックネームを登録しました。ランキングに表示されます。');
	} catch (error) {
		setAuthMessage(`ニックネームを保存できませんでした: ${error.message}`, true);
	}
});

document.querySelector('#logout-button').addEventListener('click', async () => {
	if (!supabaseClient) return;
	const { error } = await supabaseClient.auth.signOut();
	if (error) {
		setAuthMessage(`ログアウトできませんでした: ${error.message}`, true);
		return;
	}
	await handleSession(null);
	setAuthMessage('ログアウトしました。');
});

courseCards.forEach(card => card.addEventListener('click', () => showQuiz(card.dataset.startKind)));
document.querySelector('#home-button').addEventListener('click', showHome);
tabs.forEach(tab => tab.addEventListener('click', () => showQuiz(tab.dataset.kind)));

if (!window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) {
	setAuthMessage('Supabase接続設定が未完了です。SUPABASE_SETUP.mdの手順に沿って設定してください。', true);
	setRankingMessage('Supabase接続設定後にランキングを表示します');
} else if (!window.supabase?.createClient) {
	setAuthMessage('Supabaseクライアントを読み込めませんでした。インターネット接続をご確認ください。', true);
	setRankingMessage('ランキングを読み込めませんでした');
} else {
	supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
	supabaseClient.auth.onAuthStateChange((_event, session) => {
		handleSession(session);
	});
	supabaseClient.auth.getSession().then(({ data, error }) => {
		if (error) {
			setAuthMessage(`ログイン状態を確認できませんでした: ${error.message}`, true);
			return;
		}
		handleSession(data.session);
	});
}

renderStats();

// ポータルの「連携する」ボタンから開かれたときの処理
//   ・#portal-link=キー … 「連携しますか？」の確認（OK／キャンセル）を出す。キーはすぐURLから消す
//   ・#portal-link      … キーなし。連携カードを出して、欄に貼り付けてもらう
const PORTAL_KEY_HASH = /^#portal-link=([0-9A-Fa-f-]{8,64})$/;

function openPortalCard() {
	const card = document.querySelector('#portal-card');
	card.hidden = false;
	if (!quizView.hidden) showHome();
	setTimeout(() => {
		card.scrollIntoView({ behavior: 'smooth', block: 'center' });
		document.querySelector('#portal-link input')?.focus({ preventScroll: true });
	}, 250);
}

async function runPortalLinkDialog(key) {
	const dialog = document.querySelector('#portal-confirm');
	const text = document.querySelector('#portal-confirm-text');
	const ok = document.querySelector('#portal-confirm-ok');
	const cancel = document.querySelector('#portal-confirm-cancel');
	const defaultMessage = 'テンシ ポータルと連携しますか？ 送られるのは日ごとの回答数だけで、ポータルのランキングに反映されます。';
	const statusPromise = window.PortalClient.linkStatus().catch(error => {
		console.error('連携の状態を確認できませんでした。', error);
		return null;
	});
	const linkedMessage = status => status && status.linked
		? `この端末はすでに「${status.nickname || ''}」として連携しています。このキーで連携し直しますか？`
		: defaultMessage;
	if (typeof dialog.showModal !== 'function') {
		if (!window.confirm(linkedMessage(await statusPromise))) return;
		try {
			await window.PortalClient.link(key);
			window.PortalClient.syncNow();
			window.alert('連携しました。ポータルに戻って、画面を更新してください。');
		} catch (error) {
			window.alert(`連携できませんでした：${error.message}`);
		}
		return;
	}
	// 先にダイアログを出す（状態の確認を待たない）
	let busy = false;
	text.textContent = defaultMessage;
	ok.hidden = false;
	ok.disabled = true;
	ok.textContent = '連携する';
	cancel.disabled = false;
	cancel.textContent = 'キャンセル';
	statusPromise.then(status => {
		if (busy || !dialog.open) return;
		text.textContent = linkedMessage(status);
		ok.disabled = false;
	});
	await new Promise(resolve => {
		const finish = () => {
			dialog.removeEventListener('close', finish);
			ok.onclick = null;
			cancel.onclick = null;
			resolve();
		};
		dialog.addEventListener('close', finish);
		cancel.onclick = () => dialog.close();
		ok.onclick = async () => {
			busy = true;
			ok.disabled = true;
			cancel.disabled = true;
			text.textContent = '連携しています…';
			try {
				const result = await window.PortalClient.link(key);
				window.PortalClient.syncNow();
				text.textContent = `連携しました（${result?.nickname || ''}）。ポータルに戻って、画面を更新してください。`;
				ok.hidden = true;
				cancel.textContent = '閉じる';
			} catch (error) {
				text.textContent = `連携できませんでした：${error.message}`;
				ok.disabled = false;
				ok.textContent = 'もう一度';
			}
			cancel.disabled = false;
		};
		dialog.showModal();
	});
}

async function handlePortalHash() {
	const match = PORTAL_KEY_HASH.exec(location.hash);
	if (match) {
		const key = match[1];
		history.replaceState(null, '', location.pathname + location.search);   // キーをURLに残さない
		try {
			await runPortalLinkDialog(key);
		} catch (error) {
			console.error('ポータル連携の確認画面でエラーが出ました。', error);
			window.alert(`ポータル連携を始められませんでした：${error.message}`);
		}
		return;
	}
	if (location.hash === '#portal-link') openPortalCard();
}

// ===== テンシ ポータル連携（失敗してもクイズ本体は動かす） =====
try {
	if (!window.PortalClient) throw new Error('portal-client.js を読み込めませんでした。');
	window.PortalClient.init({
		url: window.PORTAL_SUPABASE_URL,
		key: window.PORTAL_SUPABASE_PUBLISHABLE_KEY,
		site: 'kobunbunpou',
		syncRpc: 'kobunbunpou_sync_daily',
		rankRpc: 'kobunbunpou_get_ranking',
		getDailyCounts: async () => loadDailyCounts()
	});
	window.PortalClient.mountLinkBox('#portal-link');
	window.addEventListener('hashchange', handlePortalHash);
	handlePortalHash();
} catch (error) {
	console.error('ポータル連携を開始できませんでした。', error);
	document.querySelector('#portal-card').hidden = true;
	if (location.hash.startsWith('#portal-link')) {
		history.replaceState(null, '', location.pathname + location.search);
		window.alert(`ポータル連携を開始できませんでした：${error.message}`);
	}
}
