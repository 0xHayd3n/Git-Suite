import '@testing-library/jest-dom'

// jsdom does not implement IntersectionObserver; provide a no-op stub so
// components that use it (e.g. Discover infinite-scroll sentinel) don't throw.
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverStub,
  })
}

// jsdom does not implement speechSynthesis; provide a no-op stub so
// components that use it (e.g. ReadmeRenderer TTS) don't throw.
if (typeof window !== 'undefined' && !window.speechSynthesis) {
  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    configurable: true,
    value: {
      getVoices: () => [],
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      onvoiceschanged: null,
      speaking: false,
      pending: false,
      paused: false,
    },
  })
}

// Stub HTMLMediaElement methods that jsdom doesn't implement
if (typeof window !== 'undefined') {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value() {},
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value() { return Promise.resolve() },
  })
}

// Stub window.api.tts for TTS hook tests
if (typeof window !== 'undefined' && !(window as any).api?.tts) {
  const api = (window as any).api ?? {}
  api.tts = {
    synthesize: async () => ({ audio: new ArrayBuffer(0), wordBoundaries: [] }),
    getVoices: async () => [
      { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
    ],
    checkAvailable: async () => false,
  }
  api.settings = api.settings ?? {
    get: async () => null,
    set: async () => {},
  }
  if (!(window as any).api) {
    Object.defineProperty(window, 'api', {
      value: api,
      writable: true,
      configurable: true,
    })
  }
}
