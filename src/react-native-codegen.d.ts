declare module 'react-native/Libraries/Types/CodegenTypes' {
  import type { NativeSyntheticEvent } from 'react-native';

  export type DirectEventHandler<T> = (
    event: NativeSyntheticEvent<T>
  ) => void | Promise<void>;

  type DefaultType = boolean | number | string | ReadonlyArray<string>;

  export type WithDefault<
    Type extends DefaultType,
    Value extends Type | string | null | undefined,
  > = Type | Extract<Value, null | undefined>;
}
