export interface ModalProps {
  title: string
  text: string
  onYes: () => void
  onNo: () => void
}

export function Modal({ title, text, onYes, onNo }: ModalProps) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onNo()}>
      <div className="box">
        <h3>{title}</h3>
        <p>{text}</p>
        <div className="acts">
          <button className="btn" onClick={onNo}>
            아니오
          </button>
          <button className="btn primary" onClick={onYes}>
            예
          </button>
        </div>
      </div>
    </div>
  )
}
