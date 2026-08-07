/* global jest */
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => {
  const worklets = require('react-native-worklets/src/mock');
  return {
    ...worklets,
    scheduleOnRN: (fn, ...args) => fn(...args),
    scheduleOnUI: (fn, ...args) => fn(...args),
  };
});
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const reanimated = require('react-native-reanimated/mock');
  return {
    ...reanimated,
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
  };
});
require('react-native-reanimated').setUpTests();
