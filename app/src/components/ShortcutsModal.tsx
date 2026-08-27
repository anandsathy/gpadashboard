import { MOD_KEY } from "@/hooks/useHotkeys";
import { Modal } from "@/components/ui/Modal";
import { Kbd } from "@/components/ui/primitives";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Getting around",
    items: [
      { keys: [MOD_KEY, "K"], label: "Open the command palette" },
      { keys: ["G", "then", "D"], label: "Dashboard" },
      { keys: ["G", "then", "C"], label: "Classes" },
      { keys: ["G", "then", "S"], label: "Simulate" },
      { keys: ["G", "then", "I"], label: "Insights" },
      { keys: ["G", "then", "T"], label: "Transcript" },
    ],
  },
  {
    title: "Doing things",
    items: [
      { keys: ["N"], label: "Add a class" },
      { keys: [MOD_KEY, "Z"], label: "Undo" },
      { keys: [MOD_KEY, "⇧", "Z"], label: "Redo" },
      { keys: ["S"], label: "Toggle simulation mode" },
      { keys: [MOD_KEY, "P"], label: "Print the transcript" },
      { keys: ["?"], label: "This list" },
    ],
  },
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Everything here also has a button — these just save a trip to it."
      size="md"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="eyebrow mb-2.5">{group.title}</h3>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center gap-3">
                  <span className="flex-1 text-[13px] text-ink-2">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key, i) =>
                      key === "then" ? (
                        <span key={i} className="text-[10.5px] text-ink-3">
                          then
                        </span>
                      ) : (
                        <Kbd key={i}>{key}</Kbd>
                      ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
        Single-letter shortcuts stay out of the way while you're typing — they only fire when the
        focus isn't in a text field.
      </p>
    </Modal>
  );
}
