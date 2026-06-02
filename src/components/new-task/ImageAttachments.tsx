import s from "../../styles";

interface PastedImage {
  id: string;
  dataUrl: string;
}

export function ImageAttachments({
  images,
  onRemove,
}: {
  images: PastedImage[];
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;

  return (
    <>
      {images.map((img) => (
        <div key={img.id} style={s.imageAttachmentItem}>
          <img src={img.dataUrl} style={s.imageAttachmentImg} />
          <button onClick={() => onRemove(img.id)} style={s.imageAttachmentRemove}>
            ✕
          </button>
        </div>
      ))}
    </>
  );
}
