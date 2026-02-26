export class StableNoteTracker {
  constructor(stableFrames = 3) {
    this._stableFrames = stableFrames;
    this._lastNote = null;
    this._stableCount = 0;
    this._confirmed = null;
    this._graceLeft = 0;
  }

  get lastNote() {
    return this._lastNote;
  }

  update(note) {
    // If we had a confirmed stable note and see a different note briefly, forgive it
    if (this._confirmed && note !== this._confirmed && note !== this._lastNote) {
      if (this._graceLeft > 0) {
        this._graceLeft--;
        // Return the confirmed note as still stable (ignore transient)
        return { stable: true, note: this._confirmed };
      }
    }

    if (note === this._lastNote) {
      this._stableCount++;
    } else {
      this._lastNote = note;
      this._stableCount = 1;
    }

    const stable = this._stableCount >= this._stableFrames;
    if (stable) {
      this._confirmed = note;
      this._graceLeft = 2; // Allow 2 transient frames before resetting
    }
    return { stable, note: this._lastNote };
  }

  reset() {
    this._lastNote = null;
    this._stableCount = 0;
    this._confirmed = null;
    this._graceLeft = 0;
  }
}
