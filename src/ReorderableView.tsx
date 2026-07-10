import type { ColorValue, ViewProps } from 'react-native';

type Props = ViewProps & {
  color?: ColorValue;
};

export function ReorderableView(_props: Props): never {
  throw new Error(
    "'react-native-reorderable' is only supported on native platforms."
  );
}
