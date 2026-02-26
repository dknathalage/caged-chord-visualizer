export class StableNoteTracker {
  constructor(stableFrames = 3) {
    this._stableFrames = stableFrames;
    this._lastNote = null;
    this._stableCount = 0;
  }

  get lastNote() {
    return this._lastNote;
  }

  update(note) {
    if (note === this._lastNote) {
      this._stableCount++;
    } else {
      this._lastNote = note;
      this._stableCount = 1;
    }
    return { stable: this._stableCount >= this._stableFrames, note: this._lastNote };
  }

  reset() {
    this._lastNote = null;
    this._stableCount = 0;
  }
}
