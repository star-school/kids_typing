// 共通設定・サウンド管理スクリプト

// ----------------------------------------------------
// 1. SettingsManager (設定の保存と共有)
// ----------------------------------------------------
const SettingsManager = {
    STORAGE_KEY: 'kids_roman_typing_settings',
    
    defaultSettings: {
        soundEnabled: true,
        voiceMode: 'ja', // 'ja' (日本語よみ) / 'en' (英語ネイティブ)
        speed: 'normal'  // 'slow' / 'normal' / 'fast'
    },

    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (data) {
                return { ...this.defaultSettings, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error('LocalStorage load error:', e);
        }
        return { ...this.defaultSettings };
    },

    save(settings) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
            // イベントを発行して他のタブでも検知できるようにする
            window.dispatchEvent(new Event('settingsChanged'));
        } catch (e) {
            console.error('LocalStorage save error:', e);
        }
    },

    get(key) {
        return this.load()[key];
    },

    set(key, value) {
        const settings = this.load();
        settings[key] = value;
        this.save(settings);
    }
};

// ----------------------------------------------------
// 2. AudioManager (Web Audio API による効果音再生)
// ----------------------------------------------------
const AudioManager = {
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playTone(freq, type = 'sine', duration = 0.2, vol = 0.1) {
        if (!SettingsManager.get('soundEnabled')) return;
        this.init();
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn('Audio play error:', e);
        }
    },

    play(type) {
        if (type === 'ok') {
            // ピコーン
            this.playTone(523, 'sine', 0.15, 0.1); // ド
            setTimeout(() => this.playTone(659, 'sine', 0.25, 0.1), 80); // ミ
        } else if (type === 'ng') {
            // ブブー
            this.playTone(150, 'sawtooth', 0.3, 0.05);
        } else if (type === 'clear') {
            // ファンファーレ（クリア）
            const scale = [523, 659, 783, 1046]; // ドミソド
            scale.forEach((freq, idx) => {
                setTimeout(() => this.playTone(freq, 'sine', 0.4, 0.08), idx * 100);
            });
        } else if (type === 'perfect') {
            // パーフェクト
            const scale = [523, 659, 783, 1046, 1318]; // ドミソドミ
            scale.forEach((freq, idx) => {
                setTimeout(() => this.playTone(freq, 'square', 0.5, 0.02), idx * 120);
            });
        }
    }
};

// ----------------------------------------------------
// 3. SpeechManager (Web Speech API による読み上げ)
// ----------------------------------------------------
const SpeechManager = {
    voices: [],

    initVoices() {
        if (!('speechSynthesis' in window)) return;
        const updateVoices = () => {
            const list = window.speechSynthesis.getVoices();
            if (list && list.length > 0) {
                this.voices = list;
            }
        };
        updateVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
        }
    },

    getBestVoice(langType) {
        if (!this.voices || this.voices.length === 0) {
            if ('speechSynthesis' in window) {
                this.voices = window.speechSynthesis.getVoices();
            }
        }
        if (!this.voices || this.voices.length === 0) return null;

        if (langType === 'en') {
            // 明瞭で信頼性の高い標準英語ボイスを優先選択（Windows/Edge/Chrome/Safari対応）
            const preferredEn = ['Jenny', 'Zira', 'Google US', 'Samantha', 'David', 'Aria', 'Guy'];
            for (const name of preferredEn) {
                const found = this.voices.find(v => 
                    v.lang.toLowerCase().startsWith('en') && v.name.includes(name)
                );
                if (found) return found;
            }

            // 一般的な en-US または en 系
            const usVoice = this.voices.find(v => v.lang.toLowerCase() === 'en-us' || v.lang.toLowerCase() === 'en_us');
            if (usVoice) return usVoice;

            const gbVoice = this.voices.find(v => v.lang.toLowerCase() === 'en-gb' || v.lang.toLowerCase() === 'en_gb');
            if (gbVoice) return gbVoice;

            const anyEn = this.voices.find(v => v.lang.toLowerCase().startsWith('en'));
            if (anyEn) return anyEn;
        } else {
            // 日本語音声の優先検索
            const preferredJa = ['Nanami', 'Haruka', 'Google 日本語', 'Kyoko', 'Ayumi', 'Ichiro'];
            for (const name of preferredJa) {
                const found = this.voices.find(v => 
                    v.lang.toLowerCase().startsWith('ja') && v.name.includes(name)
                );
                if (found) return found;
            }

            const jaVoice = this.voices.find(v => v.lang.toLowerCase() === 'ja-jp' || v.lang.toLowerCase() === 'ja_jp');
            if (jaVoice) return jaVoice;

            const anyJa = this.voices.find(v => v.lang.toLowerCase().startsWith('ja'));
            if (anyJa) return anyJa;
        }

        return null;
    },

    // 英語アルファベット単文字の誤読防止・音素固定マップ
    // Edge等で略語・音素・他言語として誤読されやすい文字を、辞書準拠の英単語で確実に固定
    englishLetterMap: {
        'H': 'aitch',       // 「エイチ」（Edgeで無音・息音になるのを防止）
        'L': 'ell',         // 「エル」（歯擦音やエスに聞こえるのを防止）
        'R': 'are',         // 「アール」（巻き舌や曖昧音になるのを防止）
        'U': 'you',         // 「ユー」（母音「ウー」と読まれるのを防止）
        'V': 'vee',         // 「ヴィー」（ローマ数字5や略語になるのを防止）
        'W': 'double you',  // 「ダブルユー」（略語や不自然な音になるのを防止）
        'Y': 'wye',         // 「ワイ」（スペイン語の「イ」になるのを防止）
        'Z': 'zee'          // 「ズィー」（アメリカ英語発音）
    },

    unlock() {
        this.initVoices();
        AudioManager.init();
        // Web Speech API の iOS 制限解除
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance('');
            u.volume = 0;
            window.speechSynthesis.speak(u);
        }
    },

    speak(text, customLang = null) {
        if (!SettingsManager.get('soundEnabled')) return;
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();
        
        const settings = SettingsManager.load();
        
        // 言語設定の優先
        const langMode = customLang || settings.voiceMode;
        let speakText = text;

        if (langMode === 'en') {
            // アルファベット単文字の場合は大文字化し、必要に応じて誤読防止テキストに変換
            const charKey = text ? text.trim().toUpperCase() : '';
            if (charKey && this.englishLetterMap[charKey]) {
                speakText = this.englishLetterMap[charKey];
            } else if (charKey && charKey.length === 1 && charKey >= 'A' && charKey <= 'Z') {
                speakText = charKey;
            }
        }

        const uttr = new SpeechSynthesisUtterance(speakText);
        
        if (langMode === 'en') {
            uttr.lang = 'en-US';
            uttr.rate = 0.8;
            const enVoice = this.getBestVoice('en');
            if (enVoice) {
                uttr.voice = enVoice;
            }
        } else {
            uttr.lang = 'ja-JP';
            uttr.rate = 1.0;
            const jaVoice = this.getBestVoice('ja');
            if (jaVoice) {
                uttr.voice = jaVoice;
            }
        }
        
        window.speechSynthesis.speak(uttr);
    },

    cancel() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }
};

// スクリプト読み込み時にボイス一覧の事前初期化を試行
if (typeof window !== 'undefined') {
    SpeechManager.initVoices();
}

// ----------------------------------------------------
// 4. Navigation (確認モーダルの動的生成・制御)
// ----------------------------------------------------
const Navigation = {
    showQuitModal(onQuit) {
        // すでにモーダルがあれば何もしない
        if (document.getElementById('quit-modal-common')) return;

        const overlay = document.createElement('div');
        overlay.id = 'quit-modal-common';
        overlay.className = 'modal-overlay';
        
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 style="margin-top: 0; color: var(--miss); font-size: 22px; font-weight: 800;">ゲームをやめる？</h3>
                <p style="font-size: 15px; font-weight: bold; line-height: 1.6; margin-bottom: 24px; color: #475569;">
                    ほんとうに タイトルに もどりますか？<br>
                    <span style="font-size: 13px; color: #7f8c8d; font-weight: normal;">※これまでの とくてんは きえてしまいます。</span>
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="modal-btn-quit" class="btn-pop btn-pop-danger" style="padding: 10px 24px;">やめる</button>
                    <button id="modal-btn-cancel" class="btn-pop btn-pop-gray" style="padding: 10px 24px;">つづける</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // ボタンのクリックイベント設定
        document.getElementById('modal-btn-quit').addEventListener('click', () => {
            overlay.remove();
            if (onQuit) {
                onQuit();
            } else {
                window.close(); // 呼び出し元タブを閉じる (ポータルから target="_blank" で開いているため)
            }
        });

        document.getElementById('modal-btn-cancel').addEventListener('click', () => {
            overlay.remove();
        });
    }
};

// ----------------------------------------------------
// 5. SoundController (共通サウンドトグル制御)
// ----------------------------------------------------
const SoundController = {
    isEnabled() {
        return SettingsManager.get('soundEnabled') ?? true;
    },

    toggle() {
        SpeechManager.unlock();
        const nextState = !this.isEnabled();
        SettingsManager.set('soundEnabled', nextState);
        this.updateAllUI();
        if (nextState) {
            AudioManager.playTone(523, 'sine', 0.1, 0.08); // ONにしたときにピッと鳴らす
        }
        return nextState;
    },

    updateAllUI() {
        const enabled = this.isEnabled();
        // 共通トグルボタン (ヘッダー/プレイ中用)
        document.querySelectorAll('.sound-toggle-btn').forEach(btn => {
            btn.innerHTML = enabled ? '🔊 おと: ON' : '🔇 おと: OFF';
            btn.classList.toggle('sound-off', !enabled);
            btn.setAttribute('title', enabled ? 'おと・こえを消す' : 'おと・こえを出す');
        });

        // スタート画面の設定用トグルボタン（もしあれば）
        const masterOn = document.getElementById('soundMasterBtn');
        const masterOff = document.getElementById('soundMasterBtnOff');
        if (masterOn && masterOff) {
            masterOn.classList.toggle('active', enabled);
            masterOff.classList.toggle('active', !enabled);
        }
    },

    init() {
        this.updateAllUI();
        window.addEventListener('settingsChanged', () => this.updateAllUI());
        window.addEventListener('storage', () => this.updateAllUI());
    }
};

// ページ読み込み完了時に自動初期化
window.addEventListener('DOMContentLoaded', () => {
    SoundController.init();
});

