import { FileText, X } from "lucide-react";
import s from "../../styles";

export interface PastedText {
  id: string;
  text: string;
}

function formatSize(len: number): string {
  if (len < 1000) return `${len}`;
  return `${(len / 1000).toFixed(1)}K`;
}

export function TextAttachments({
  texts,
  onRemove,
}: {
  texts: PastedText[];
  onRemove: (id: string) => void;
}) {
  if (texts.length === 0) return null;

  return (
    <div style={s.textAttachmentsRow}>
      {texts.map((item) => (
        <div key={item.id} style={s.textAttachmentChip}>
          <FileText size={18} style={s.textAttachmentIcon} />
          <span style={s.textAttachmentSize}>{formatSize(item.text.length)}</span>
          <button onClick={() => onRemove(item.id)} style={s.textAttachmentRemove}>
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
