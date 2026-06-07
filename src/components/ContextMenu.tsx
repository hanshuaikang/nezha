import * as RCtx from "@radix-ui/react-context-menu";

export type MenuItem =
  | {
      label: string;
      onSelect: () => void | Promise<void>;
      variant?: "default" | "success" | "destructive";
      disabled?: boolean;
    }
  | { separator: true };

interface ContextMenuProps {
  items: MenuItem[];
  children: React.ReactNode;
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  if (items.length === 0) return <>{children}</>;
  return (
    <RCtx.Root modal={false}>
      <RCtx.Trigger asChild>
        {children}
      </RCtx.Trigger>
      <RCtx.Portal>
        <RCtx.Content className="ctx-menu" onCloseAutoFocus={(e) => e.preventDefault()}>
          {items.map((item, i) => {
            if ("separator" in item) {
              return <RCtx.Separator key={`sep-${i}`} className="ctx-menu-separator" />;
            }
            return (
              <RCtx.Item
                key={`item-${i}`}
                className={`ctx-menu-item ctx-menu-item--${item.variant ?? "default"}`}
                disabled={item.disabled}
                onSelect={() => {
                  const result = item.onSelect();
                  if (result && typeof (result as Promise<void>).catch === "function") {
                    (result as Promise<void>).catch(console.error);
                  }
                }}
              >
                {item.label}
              </RCtx.Item>
            );
          })}
        </RCtx.Content>
      </RCtx.Portal>
    </RCtx.Root>
  );
}
