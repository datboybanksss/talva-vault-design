import * as Dialog from "@radix-ui/react-dialog";
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

type ElementProps = {
  children?: ReactNode;
  role?: string;
  "aria-modal"?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
};

/** Adds Radix focus/Escape behaviour without adding or restyling visible elements. */
export function AccessibleModal({
  children,
  onClose,
  label,
}: {
  children: ReactElement<ElementProps>;
  onClose: () => void;
  label?: string;
}) {
  const [opener] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  let hasTitle = false;
  function withTitle(node: ReactNode): ReactNode {
    return Children.map(node, (child) => {
      if (!isValidElement<ElementProps>(child)) return child;
      if (!hasTitle && typeof child.type === "string" && /^h[1-6]$/.test(child.type)) {
        hasTitle = true;
        return <Dialog.Title asChild>{child}</Dialog.Title>;
      }
      return child.props.children
        ? cloneElement(child, {}, withTitle(child.props.children))
        : child;
    });
  }
  let hasPanel = false;
  const content = Children.map(children.props.children, (child) => {
    if (hasPanel || !isValidElement<ElementProps>(child)) return child;
    hasPanel = true;
    const panel = cloneElement(child, {}, withTitle(child.props.children));
    return (
      <Dialog.Content
        asChild
        aria-label={hasTitle ? undefined : label}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus();
        }}
      >
        {panel}
      </Dialog.Content>
    );
  });
  const overlay = cloneElement(
    children,
    {
      role: "presentation",
      "aria-modal": undefined,
      onClick: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
    },
    content,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay asChild>{overlay}</Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
