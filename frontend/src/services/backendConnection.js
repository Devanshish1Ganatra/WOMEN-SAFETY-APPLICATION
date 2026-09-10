const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * The Android Studio Debug task starts the local backend before installing the
 * APK. A short retry removes the small race between the APK launch and Node
 * finishing its startup, without hiding server-side HTTP errors.
 */
export async function fetchWithBackendRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await wait(700 * (attempt + 1));
    }
  }
  throw lastError;
}

export const localBackendUnavailableMessage =
  'Safe-Era local server is unavailable. Run the app using Android Studio Debug while this phone/emulator is connected by USB; the project will start the backend and configure its connection automatically.';
