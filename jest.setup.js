/* global jest */
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => {
  const worklets = require('react-native-worklets/src/mock');
  return {
    ...worklets,
    scheduleOnRN: jest.fn((fn, ...args) => fn(...args)),
    scheduleOnUI: (fn, ...args) => {
      fn(...args);
      global.__reorderableFrameCallbacks?.forEach((callback) =>
        callback({ timeSincePreviousFrame: 16 })
      );
    },
  };
});
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const reanimated = require('react-native-reanimated/mock');
  const frameCallbacks =
    global.__reorderableFrameCallbacks ??
    (global.__reorderableFrameCallbacks = new Set());
  const frameControls =
    global.__reorderableFrameControls ??
    (global.__reorderableFrameControls = new Set());
  return {
    ...reanimated,
    useAnimatedRef: () => {
      const ref = (value) => {
        ref.current = value;
      };
      ref.current = null;
      return ref;
    },
    useSharedValue: (initialValue) => {
      const shared = React.useRef();
      if (shared.current == null) {
        shared.current = {
          value: initialValue,
          get() {
            return this.value;
          },
          set(nextValue) {
            this.value =
              typeof nextValue === 'function'
                ? nextValue(this.value)
                : nextValue;
          },
          modify(modifier) {
            this.value = modifier(this.value);
          },
        };
      }
      return shared.current;
    },
    useFrameCallback: (callback, autostart = true) => {
      const callbackRef = React.useRef(callback);
      callbackRef.current = callback;
      const control = React.useRef();
      if (control.current == null) {
        control.current = {
          isActive: autostart,
          setActive(active) {
            this.isActive = active;
          },
        };
      }
      const runner = React.useRef();
      if (runner.current == null) {
        runner.current = (frame) => {
          if (control.current.isActive) callbackRef.current(frame);
        };
      }
      React.useEffect(() => {
        const currentRunner = runner.current;
        const currentControl = control.current;
        frameCallbacks.add(currentRunner);
        frameControls.add(currentControl);
        return () => {
          frameCallbacks.delete(currentRunner);
          frameControls.delete(currentControl);
        };
      }, []);
      return control.current;
    },
  };
});
require('react-native-reanimated').setUpTests();
require('reassure').configure({ testingLibrary: 'react-native' });
