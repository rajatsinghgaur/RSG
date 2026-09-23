/* Camera capture starts only after the visitor explicitly chooses Enable Camera. */
(() => {
  "use strict";

  const PROJECT_URL = "https://xqmoqgpslxnpngqgyock.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_hZ-7SSva-xvcAuPdpTbRWQ_Sbv5u6qK";
  const BUCKET = "visitor-captures";
  const CHOICE_KEY = "rsg-camera-choice-v2";

  const gate = document.getElementById("cameraConsentGate");
  const startButton = document.getElementById("cameraConsentStart");
  const continueButton = document.getElementById("cameraConsentContinue");
  const retryButton = document.getElementById("cameraUploadRetry");
  const message = document.getElementById("cameraConsentMessage");
  const preview = document.getElementById("cameraConsentPreview");
  const status = document.getElementById("cameraRecordingStatus");
  if (!gate || !startButton || !continueButton || !retryButton || !message || !preview || !status) return;

  const setChoice = (value) => {
    try { sessionStorage.setItem(CHOICE_KEY, value); } catch (_) {}
  };
  try {
    if (sessionStorage.getItem(CHOICE_KEY) === "complete" || sessionStorage.getItem(CHOICE_KEY) === "skip") {
      gate.hidden = true;
      return;
    }
  } catch (_) {}

  let stream = null;
  let recorder = null;
  let photoBlob = null;
  let videoBlob = null;
  let uploadPaths = null;
  let uploadedPhoto = false;
  let uploadedVideo = false;
  let active = false;
  let cancelled = false;
  let countdownTimer = null;
  let stopTimer = null;

  const tell = (text) => { message.textContent = text; };
  const stopCamera = () => {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    preview.srcObject = null;
    preview.hidden = true;
    status.hidden = true;
  };
  const continueWithoutCamera = () => {
    cancelled = true;
    if (stopTimer) window.clearTimeout(stopTimer);
    if (countdownTimer) window.clearInterval(countdownTimer);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopCamera();
    active = false;
    setChoice("skip");
    gate.hidden = true;
  };
  continueButton.addEventListener("click", continueWithoutCamera);

  async function uploadCapture(blob, path, contentType) {
    const response = await fetch(PROJECT_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        "Content-Type": contentType,
        "x-upsert": "false"
      },
      body: blob
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Upload failed (" + response.status + "). " + detail.slice(0, 180));
    }
  }

  async function uploadBoth() {
    retryButton.hidden = true;
    tell("Uploading your photo and silent video to the private visitor-captures bucket…");
    try {
      if (!uploadedPhoto) {
        await uploadCapture(photoBlob, uploadPaths.photo, "image/jpeg");
        uploadedPhoto = true;
      }
      if (!uploadedVideo) {
        await uploadCapture(videoBlob, uploadPaths.video, (videoBlob.type || uploadPaths.videoType).split(";")[0]);
        uploadedVideo = true;
      }
      setChoice("complete");
      tell("Upload complete. Your camera is off; you can continue browsing.");
      window.setTimeout(() => { gate.hidden = true; }, 1600);
    } catch (error) {
      tell((error.message || "Upload failed.") + " Your camera is off. You can retry or continue without camera.");
      retryButton.hidden = false;
    }
  }
  retryButton.addEventListener("click", uploadBoth);

  startButton.addEventListener("click", async () => {
    if (active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      tell("Camera access is unavailable in this browser. You can continue without camera.");
      gate.classList.add("camera-gate--started");
      return;
    }
    active = true;
    cancelled = false;
    gate.classList.add("camera-gate--started");
    startButton.disabled = true;
    tell("Requesting front camera permission. No microphone access will be requested.");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false
      });
      if (cancelled) { stopCamera(); return; }
      preview.hidden = false;
      preview.srcObject = stream;
      await preview.play();
      if (preview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve, reject) => {
          preview.addEventListener("loadeddata", resolve, { once: true });
          window.setTimeout(() => reject(new Error("Camera preview did not start.")), 10000);
        });
      }
      if (cancelled) { stopCamera(); return; }

      const canvas = document.createElement("canvas");
      canvas.width = preview.videoWidth;
      canvas.height = preview.videoHeight;
      canvas.getContext("2d", { alpha: false }).drawImage(preview, 0, 0, canvas.width, canvas.height);
      photoBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not capture the JPEG photo.")), "image/jpeg", 0.9);
      });
      if (cancelled) { stopCamera(); return; }

      if (!window.MediaRecorder) throw new Error("Video recording is not supported by this browser.");
      const supportedType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType, videoBitsPerSecond: 1000000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 1000000 });
      const chunks = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      const sessionId = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
      const folder = "visitors/" + sessionId;
      const extension = recorder.mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
      uploadPaths = {
        photo: folder + "/verification.jpg",
        video: folder + "/verification." + extension,
        videoType: extension === "mp4" ? "video/mp4" : "video/webm"
      };

      tell("CAMERA ON. Recording one silent 20-second video. The camera will turn off automatically.");
      status.hidden = false;
      status.textContent = "CAMERA ON · CAMERA RECORDING · 20s";
      recorder.start();
      const startedAt = performance.now();
      countdownTimer = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((20000 - (performance.now() - startedAt)) / 1000));
        status.textContent = "CAMERA ON · CAMERA RECORDING · " + remaining + "s";
      }, 200);
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
        stopTimer = window.setTimeout(() => {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        }, 20000);
      });
      window.clearTimeout(stopTimer);
      window.clearInterval(countdownTimer);
      videoBlob = new Blob(chunks, { type: recorder.mimeType || ("video/" + extension) });
      stopCamera();
      active = false;
      if (cancelled) return;
      startButton.hidden = true;
      continueButton.hidden = true;
      await uploadBoth();
    } catch (error) {
      stopCamera();
      active = false;
      startButton.disabled = false;
      if (cancelled) return;
      tell((error && error.name === "NotAllowedError")
        ? "Camera permission was not granted. No capture was made. You can try again or continue without camera."
        : "Camera verification could not finish. " + (error.message || "Please try again.") + " No microphone is used.");
    }
  });
})();
