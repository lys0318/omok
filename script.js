class OmokGame {
    constructor() {
        this.boardSize = 15;
        this.board = Array.from({ length: this.boardSize }, () => Array(this.boardSize).fill(null));
        this.currentTurn = 'black';
        this.isGameOver = false;
        this.gameMode = null; // 'pvp' or 'ai'
        this.timeLeft = 30;
        this.timerInterval = null;

        // DOM Elements
        this.boardElement = document.getElementById('board');
        this.statusMessageElement = document.getElementById('status-message');
        this.timerDisplayElement = document.getElementById('timer-display');
        this.playerBlackElement = document.getElementById('player-black');
        this.playerWhiteElement = document.getElementById('player-white');
        this.resetBtn = document.getElementById('reset-btn');
        this.winOverlay = document.getElementById('win-overlay');
        this.winTitle = document.getElementById('win-title');
        this.winDesc = document.getElementById('win-desc');
        this.modalResetBtn = document.getElementById('modal-reset-btn');
        this.modeOverlay = document.getElementById('mode-overlay');

        this.init();
    }

    init() {
        this.renderBoard();
        this.bindEvents();
        this.initAudio();
    }

    // ─── 효과음 ──────────────────────────────────────────────

    initAudio() {
        try {
            const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
            this.audioCtx = new AudioCtx();
        } catch (e) {
            this.audioCtx = null;
        }
    }

    resumeAudio() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    // 돌 놓는 소리 (나무 돌 타격음)
    playStoneSound() {
        if (!this.audioCtx) return;
        this.resumeAudio();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // 노이즈 버스트 (타격감)
        const bufSize = Math.floor(ctx.sampleRate * 0.07);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 4);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1500;
        noiseFilter.Q.value = 0.6;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        // 저음 (울림)
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.35, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    // 째깍 소리 (10초 이내 타이머)
    playTickSound() {
        if (!this.audioCtx) return;
        this.resumeAudio();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1100, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
    }

    renderBoard() {
        this.boardElement.innerHTML = '';

        const starPoints = [
            [3,3],[3,7],[3,11],
            [7,3],[7,7],[7,11],
            [11,3],[11,7],[11,11]
        ];

        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.style.top = `calc(${r} * var(--cell-size))`;
                cell.style.left = `calc(${c} * var(--cell-size))`;

                if (starPoints.some(([sr, sc]) => sr === r && sc === c)) {
                    const star = document.createElement('div');
                    star.className = 'star-point';
                    cell.appendChild(star);
                }

                this.boardElement.appendChild(cell);
            }
        }
    }

    bindEvents() {
        this.boardElement.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                // AI 모드에서 AI 차례엔 클릭 무시
                if (this.gameMode === 'ai' && this.currentTurn === 'white') return;
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                this.placeStone(row, col);
            }
        });

        this.resetBtn.addEventListener('click', () => this.showModeScreen());
        this.modalResetBtn.addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });

        // 모드 버튼은 onclick 속성으로도 처리 (bindEvents 백업)
    }

    showModeScreen() {
        clearInterval(this.timerInterval);
        this.modeOverlay.classList.remove('hidden');
    }

    startGame(mode) {
        this.gameMode = mode;
        this.modeOverlay.classList.add('hidden');

        // AI 모드일 때 흰돌 라벨 변경
        const whiteNameEl = this.playerWhiteElement.querySelector('.player-name');
        if (mode === 'ai') {
            whiteNameEl.textContent = 'AI (White)';
        } else {
            whiteNameEl.textContent = '백돌 (White)';
        }

        this.resetGame();
    }

    resetGame() {
        clearInterval(this.timerInterval);
        this.board = Array.from({ length: this.boardSize }, () => Array(this.boardSize).fill(null));
        this.currentTurn = 'black';
        this.isGameOver = false;

        // 승리 선 제거
        this.boardElement.querySelectorAll('.win-line').forEach(el => el.remove());

        const starPoints = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
        document.querySelectorAll('.cell').forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            cell.classList.remove('has-stone');
            cell.innerHTML = '';
            if (starPoints.some(([sr, sc]) => sr === r && sc === c)) {
                const star = document.createElement('div');
                star.className = 'star-point';
                cell.appendChild(star);
            }
        });

        this.updateUI();
        this.startTimer();
    }

    // ─── 타이머 ───────────────────────────────────────────────

    startTimer() {
        // AI 차례엔 타이머 없음
        if (this.gameMode === 'ai' && this.currentTurn === 'white') {
            this.timerDisplayElement.textContent = '-';
            this.timerDisplayElement.classList.remove('urgent');
            return;
        }

        clearInterval(this.timerInterval);
        this.timeLeft = 30;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
                this.updateUI();
                this.startTimer();

                // AI 모드에서 시간 초과로 AI 차례가 됐을 경우
                if (this.gameMode === 'ai' && this.currentTurn === 'white') {
                    this.scheduleAIMove();
                }
            }
        }, 1000);
    }

    updateTimerDisplay() {
        this.timerDisplayElement.textContent = this.timeLeft;
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
            this.timerDisplayElement.classList.add('urgent');
            this.playTickSound();
        } else {
            this.timerDisplayElement.classList.remove('urgent');
        }
    }

    // ─── 돌 놓기 ─────────────────────────────────────────────

    placeStone(row, col) {
        if (this.isGameOver || this.board[row][col] !== null) return;
        this.playStoneSound();

        this.board[row][col] = this.currentTurn;

        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add('has-stone');
        const stone = document.createElement('div');
        stone.className = `stone ${this.currentTurn}`;
        cell.appendChild(stone);

        const winningCells = this.checkWin(row, col);
        if (winningCells) {
            this.handleWin(winningCells);
            return;
        }

        if (this.checkDraw()) {
            this.handleDraw();
            return;
        }

        this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
        this.updateUI();
        this.startTimer();

        if (this.gameMode === 'ai' && this.currentTurn === 'white') {
            this.scheduleAIMove();
        }
    }

    // ─── AI ──────────────────────────────────────────────────

    scheduleAIMove() {
        setTimeout(() => {
            if (this.isGameOver) return;
            const move = this.getBestMove();
            if (move) this.placeStone(move.r, move.c);
        }, 500);
    }

    getBestMove() {
        let bestScore = -Infinity;
        let bestMove = null;

        // 후보 셀: 기존 돌 주변 2칸 이내만 평가 (성능 최적화)
        const candidates = this.getCandidateCells();

        for (const { r, c } of candidates) {
            // AI(white) 공격 점수
            this.board[r][c] = 'white';
            const aiScore = this.evaluatePosition(r, c, 'white');
            this.board[r][c] = null;

            // 플레이어(black) 차단 점수
            this.board[r][c] = 'black';
            const playerScore = this.evaluatePosition(r, c, 'black');
            this.board[r][c] = null;

            // 즉시 이길 수 있으면 최우선, 아니면 공격/방어 균형
            const score = aiScore >= 1000000 ? aiScore : Math.max(aiScore, playerScore * 0.95);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { r, c };
            }
        }

        // 후보가 없으면 중앙
        return bestMove || { r: 7, c: 7 };
    }

    getCandidateCells() {
        const candidates = new Set();
        const range = 2;

        let hasAny = false;
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (this.board[r][c] === null) continue;
                hasAny = true;
                for (let dr = -range; dr <= range; dr++) {
                    for (let dc = -range; dc <= range; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && this.board[nr][nc] === null) {
                            candidates.add(`${nr},${nc}`);
                        }
                    }
                }
            }
        }

        if (!hasAny) return [{ r: 7, c: 7 }];

        return Array.from(candidates).map(key => {
            const [r, c] = key.split(',').map(Number);
            return { r, c };
        });
    }

    evaluatePosition(row, col, player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let total = 0;

        for (const [dr, dc] of directions) {
            let count = 1;
            let openEnds = 0;

            // 한쪽 방향
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && this.board[r][c] === player) {
                count++; r += dr; c += dc;
            }
            if (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && this.board[r][c] === null) openEnds++;

            // 반대 방향
            r = row - dr; c = col - dc;
            while (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && this.board[r][c] === player) {
                count++; r -= dr; c -= dc;
            }
            if (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && this.board[r][c] === null) openEnds++;

            total += this.getPatternScore(count, openEnds);
        }

        return total;
    }

    getPatternScore(count, openEnds) {
        if (count >= 5) return 1000000;
        if (openEnds === 0) return 0;
        if (count === 4) return openEnds === 2 ? 100000 : 10000;
        if (count === 3) return openEnds === 2 ? 5000 : 500;
        if (count === 2) return openEnds === 2 ? 100 : 10;
        return openEnds === 2 ? 5 : 1;
    }

    // ─── 승패 판정 ────────────────────────────────────────────

    checkWin(row, col) {
        const directions = [
            [[0, 1], [0, -1]],
            [[1, 0], [-1, 0]],
            [[1, 1], [-1, -1]],
            [[1, -1], [-1, 1]]
        ];

        const player = this.board[row][col];

        for (const dir of directions) {
            let count = 1;
            let currentLine = [{ r: row, c: col }];

            for (const [dr, dc] of dir) {
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize && this.board[r][c] === player) {
                    count++;
                    currentLine.push({ r, c });
                    r += dr; c += dc;
                }
            }

            if (count >= 5) return currentLine;
        }
        return null;
    }

    checkDraw() {
        for (let r = 0; r < this.boardSize; r++)
            for (let c = 0; c < this.boardSize; c++)
                if (this.board[r][c] === null) return false;
        return true;
    }

    drawWinLine(winningCells) {
        const sorted = [...winningCells].sort((a, b) => a.r - b.r || a.c - b.c);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        const boardRect = this.boardElement.getBoundingClientRect();
        const cellW = boardRect.width / this.boardSize;
        const cellH = boardRect.height / this.boardSize;

        const x1 = first.c * cellW + cellW / 2;
        const y1 = first.r * cellH + cellH / 2;
        const x2 = last.c * cellW + cellW / 2;
        const y2 = last.r * cellH + cellH / 2;

        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

        const line = document.createElement('div');
        line.className = 'win-line';
        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.transform = `translateY(-50%) rotate(${angle}deg)`;
        this.boardElement.appendChild(line);
    }

    handleWin(winningCells) {
        this.isGameOver = true;
        clearInterval(this.timerInterval);
        this.timerDisplayElement.classList.remove('urgent');

        winningCells.forEach(({ r, c }) => {
            const stone = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"] .stone`);
            if (stone) stone.classList.add('winning');
        });

        this.drawWinLine(winningCells);

        setTimeout(() => {
            const isBlack = this.currentTurn === 'black';
            let winnerName;
            if (this.gameMode === 'ai') {
                winnerName = isBlack ? '당신' : 'AI';
            } else {
                winnerName = isBlack ? '흑돌' : '백돌';
            }
            this.winTitle.textContent = isBlack || this.gameMode !== 'ai' ? '승리!' : '패배...';
            this.winDesc.textContent = `${winnerName}이 승리했습니다.`;
            this.winTitle.style.background = isBlack
                ? 'linear-gradient(to right, #444, #111)'
                : 'linear-gradient(to right, #fff, #d4d4d4)';
            this.winOverlay.classList.remove('hidden');
        }, 800);
    }

    handleDraw() {
        this.isGameOver = true;
        clearInterval(this.timerInterval);
        this.timerDisplayElement.classList.remove('urgent');
        this.statusMessageElement.textContent = '무승부입니다!';
        setTimeout(() => {
            this.winTitle.textContent = '무승부';
            this.winDesc.textContent = '치열한 승부였네요.';
            this.winTitle.style.background = 'linear-gradient(to right, #94a3b8, #64748b)';
            this.winOverlay.classList.remove('hidden');
        }, 800);
    }

    // ─── UI ──────────────────────────────────────────────────

    updateUI() {
        this.boardElement.dataset.turn = this.currentTurn;

        if (this.currentTurn === 'black') {
            this.playerBlackElement.classList.add('active');
            this.playerWhiteElement.classList.remove('active');
            this.statusMessageElement.textContent = '흑의 차례입니다';
        } else {
            this.playerWhiteElement.classList.add('active');
            this.playerBlackElement.classList.remove('active');
            this.statusMessageElement.textContent = this.gameMode === 'ai' ? 'AI 생각중...' : '백의 차례입니다';
        }
    }
}

// script 태그가 body 맨 아래에 있으므로 DOM이 이미 준비됨
window.omokGame = new OmokGame();
