const statusElement = document.getElementById("status");
const talkButton = document.getElementById("talkButton");
const messagesElement = document.getElementById("messages");


const RAILWAY_URL =
    "wss://lehnerchatbotv03audio-production.up.railway.app/ws";


let socket = null;
let mediaRecorder = null;
let audioStream = null;
let audioChunks = [];
let currentAudio = null;
let audioQueue = [];
let isPlayingAudio = false;


// --------------------------------------------------
// STATUS
// --------------------------------------------------

function setStatus(text) {

    statusElement.textContent = text;

}

// --------------------------------------------------
// AUDIO PLAYBACK QUEUE
// --------------------------------------------------

async function playNextAudio() {

    if (isPlayingAudio) {
        return;
    }

    if (audioQueue.length === 0) {
        currentAudio = null;
        return;
    }

    isPlayingAudio = true;

    const audioBlob = audioQueue.shift();

    const audioUrl =
        URL.createObjectURL(audioBlob);

    const audio =
        new Audio(audioUrl);

    currentAudio = audio;


    audio.onplay = () => {

        console.log(
            "[TTS] Playback started"
        );

    };


    audio.onended = () => {

        console.log(
            "[TTS] Playback finished"
        );

        URL.revokeObjectURL(
            audioUrl
        );

        if (currentAudio === audio) {
            currentAudio = null;
        }

        isPlayingAudio = false;

        playNextAudio();

    };


    audio.onerror = (error) => {

        console.error(
            "[TTS] Audio error:",
            error
        );

        URL.revokeObjectURL(
            audioUrl
        );

        if (currentAudio === audio) {
            currentAudio = null;
        }

        isPlayingAudio = false;

        playNextAudio();

    };


    try {

        await audio.play();

    }
    catch (error) {

        console.error(
            "[TTS] Playback failed:",
            error
        );

        URL.revokeObjectURL(
            audioUrl
        );

        if (currentAudio === audio) {
            currentAudio = null;
        }

        isPlayingAudio = false;

        playNextAudio();

    }

}
// --------------------------------------------------
// WEBSOCKET
// --------------------------------------------------

function connect() {

    setStatus("Connecting...");

    socket = new WebSocket(RAILWAY_URL);


    socket.addEventListener("open", () => {

        console.log("[WebSocket] Connected");

        setStatus("Connected");

    });


    socket.addEventListener("message", async (event) => {

        console.log(
            "[WebSocket] Message received. Type:",
            typeof event.data
        );


        // --------------------------------------------------
        // TEXT MESSAGE
        // --------------------------------------------------

        if (typeof event.data === "string") {

            console.log("[WebSocket] Text:", event.data);

            let message;

            try {
                message = JSON.parse(event.data);
            }
            catch (error) {
                console.warn(
                    "[WebSocket] Not JSON:",
                    event.data
                );
                return;
            }

            console.log(
                "[WebSocket] Parsed message:",
                message
            );

        if (message.type === "state") {

            console.log(
                "[State] Assistant state:",
                message.state
            );

            switch (message.state) {

                case "IDLE":
                    setStatus("Ready");
                    break;

                case "RECORDING":
                    setStatus("Recording...");
                    break;

                case "TRANSCRIBING":
                    setStatus("Transcribing...");
                    break;

                case "THINKING":
                    setStatus("Thinking...");
                    break;

                case "SPEAKING":
                    setStatus("Speaking...");
                    break;

                default:
                    setStatus(message.state);
            }

            return;
        }


        if (message.type === "text") {

            const messageElement =
                document.createElement("div");

            messageElement.className =
                `message ${message.role || "assistant"}`;

            messageElement.textContent =
                message.text || "";

            messagesElement.appendChild(
                messageElement
            );

            messagesElement.scrollTop =
                messagesElement.scrollHeight;
        }

            return;
        }

        // --------------------------------------------------
        // BINARY MESSAGE
        // --------------------------------------------------

        if (event.data instanceof Blob) {

            console.log(
                "[WebSocket] Blob received:",
                event.data.size,
                "bytes",
                event.data.type
            );

            audioQueue.push(event.data);

            console.log(
                "[TTS] Audio queued. Queue length:",
                audioQueue.length
            );

            playNextAudio();

            return;
        }


        // --------------------------------------------------
        // ARRAYBUFFER FALLBACK
        // --------------------------------------------------

        if (event.data instanceof ArrayBuffer) {

            console.log(
                "[WebSocket] ArrayBuffer received:",
                event.data.byteLength,
                "bytes"
            );


            const audioBlob = new Blob(
                [event.data],
                {
                    type: "audio/mpeg"
                }
            );


            const audioUrl =
                URL.createObjectURL(audioBlob);


            const audio =
                new Audio(audioUrl);

            currentAudio = audio;


            audio.onended = () => {

                URL.revokeObjectURL(audioUrl);

            };


            try {

                await audio.play();

                console.log(
                    "[TTS] ArrayBuffer playback started"
                );

            }
            catch (error) {

                console.error(
                    "[TTS] ArrayBuffer playback failed:",
                    error
                );

            }

            return;
        }


        console.warn(
            "[WebSocket] Unknown message type:",
            event.data
        );

    });


    socket.addEventListener("close", () => {

        console.log(
            "[WebSocket] Disconnected"
        );

        setStatus("Disconnected");

    });


    socket.addEventListener("error", (error) => {

        console.error(
            "[WebSocket] Error:",
            error
        );

        setStatus("Connection error");

    });

}


// --------------------------------------------------
// RECORDING
// --------------------------------------------------

async function startRecording() {

    if (!socket) {
        return;
    }


    if (socket.readyState !== WebSocket.OPEN) {
        return;
    }


    // --------------------------------------------------
    // INTERRUPT CURRENT BROWSER AUDIO
    // --------------------------------------------------

    if (currentAudio) {

        console.log(
            "[Interrupt] Stopping current browser audio"
        );

        currentAudio.pause();
        currentAudio.currentTime = 0;

        currentAudio = null;
    }


    // --------------------------------------------------
    // CLEAR QUEUED BROWSER AUDIO
    // --------------------------------------------------

    if (audioQueue.length > 0) {

        console.log(
            "[Interrupt] Clearing browser audio queue:",
            audioQueue.length,
            "items"
        );

        audioQueue = [];
    }


    isPlayingAudio = false;


    try {

        audioStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });


        audioChunks = [];


        mediaRecorder =
            new MediaRecorder(
                audioStream
            );


        mediaRecorder.addEventListener(
            "dataavailable",
            (event) => {

                if (event.data.size > 0) {

                    audioChunks.push(
                        event.data
                    );

                }

            }
        );


        mediaRecorder.addEventListener(
            "stop",
            async () => {

                const audioBlob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                                mediaRecorder.mimeType
                        }
                    );


                console.log(
                    "[Recorder] Audio size:",
                    audioBlob.size
                );


                const arrayBuffer =
                    await audioBlob.arrayBuffer();


                if (
                    socket &&
                    socket.readyState ===
                        WebSocket.OPEN
                ) {

                    socket.send(
                        arrayBuffer
                    );


                    console.log(
                        "[WebSocket] Audio sent"
                    );

                }


                audioStream
                    .getTracks()
                    .forEach(
                        track => track.stop()
                    );

            }
        );


        mediaRecorder.start();


        setStatus("Recording...");


        console.log(
            "[Recorder] Started"
        );

    }
    catch (error) {

        console.error(
            "[Recorder] Could not start:",
            error
        );

        setStatus(
            "Microphone error"
        );

    }

}


// --------------------------------------------------
// STOP RECORDING
// --------------------------------------------------

function stopRecording() {

    if (!mediaRecorder) {
        return;
    }


    if (
        mediaRecorder.state ===
        "recording"
    ) {

        mediaRecorder.stop();


        setStatus(
            "Processing..."
        );


        console.log(
            "[Recorder] Stopped"
        );

    }

}


// --------------------------------------------------
// TALK BUTTON
// --------------------------------------------------

talkButton.addEventListener(
    "pointerdown",
    async (event) => {

        event.preventDefault();

        await startRecording();

    }
);


talkButton.addEventListener(
    "pointerup",
    (event) => {

        event.preventDefault();

        stopRecording();

    }
);


talkButton.addEventListener(
    "pointercancel",
    () => {

        stopRecording();

    }
);


// --------------------------------------------------
// CONNECT
// --------------------------------------------------

connect();