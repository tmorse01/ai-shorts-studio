import styles from './PreviewCanvas.module.css'

// The centre of the editor: a near-black canvas holding an empty 9:16 frame. Real video replaces
// the frame in epic 03.
export function PreviewCanvas() {
  return (
    <section className={styles.canvas} aria-label="Preview">
      <div className={styles.frame} role="img" aria-label="Empty 9:16 preview frame">
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.ratio} aria-hidden="true">
          9:16
        </span>
      </div>
    </section>
  )
}
