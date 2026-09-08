//! Bounded paste sequencing, independent of Windows so races can be tested deterministically.

/// Native operations used by one paste attempt. Implementations must not link input queues.
pub(crate) trait PasteDesktop {
  fn selection_released(&self) -> bool;
  fn clipboard_unchanged(&self) -> bool;
  fn activate_target(&self) -> Result<(), String>;
  fn target_focused(&self) -> bool;
  fn send_paste(&self) -> Result<(), String>;
  fn pause(&self);
}

/// Submits at most one Ctrl+V after release and stable focus checks.
/// Failure never retries input, because partial input delivery cannot safely be repeated.
pub(crate) fn deliver(desktop: &impl PasteDesktop) -> Result<(), String> {
  // 64 x 8 ms bounds a held modifier without synthesizing key-up for a user's keys.
  let mut released = false;
  for _ in 0..64 {
    if !desktop.clipboard_unchanged() {
      return Err("clipboard-changed".into());
    }
    if desktop.selection_released() {
      released = true;
      break;
    }
    desktop.pause();
  }
  if !released {
    return Err("selection-keys-held".into());
  }
  desktop.activate_target()?;
  let mut focused_once = false;
  for _ in 0..32 {
    if !desktop.clipboard_unchanged() {
      return Err("clipboard-changed".into());
    }
    if desktop.target_focused() {
      if focused_once && desktop.selection_released() {
        return desktop.send_paste();
      }
      focused_once = true;
    } else if focused_once {
      // A user focus change cancels delivery instead of pulling focus back again.
      return Err("target-focus-lost".into());
    }
    desktop.pause();
  }
  Err("target-focus-timeout".into())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::Cell;

  struct Desktop {
    tick: Cell<usize>,
    release_at: usize,
    focus_at: usize,
    lose_focus_at: usize,
    change_clipboard_at: usize,
    sends: Cell<usize>,
    activations: Cell<usize>,
    reject_input: bool,
  }

  impl Default for Desktop {
    fn default() -> Self {
      Self { tick: Cell::new(0), release_at: 0, focus_at: 0,
        lose_focus_at: usize::MAX, change_clipboard_at: usize::MAX,
        sends: Cell::new(0), activations: Cell::new(0), reject_input: false }
    }
  }

  impl PasteDesktop for Desktop {
    fn selection_released(&self) -> bool { self.tick.get() >= self.release_at }
    fn clipboard_unchanged(&self) -> bool { self.tick.get() < self.change_clipboard_at }
    fn activate_target(&self) -> Result<(), String> {
      self.activations.set(self.activations.get() + 1);
      Ok(())
    }
    fn target_focused(&self) -> bool {
      self.tick.get() >= self.focus_at && self.tick.get() < self.lose_focus_at
    }
    fn send_paste(&self) -> Result<(), String> {
      self.sends.set(self.sends.get() + 1);
      if self.reject_input { Err("input-rejected".into()) } else { Ok(()) }
    }
    fn pause(&self) { self.tick.set(self.tick.get() + 1); }
  }

  #[test]
  fn waits_for_release_and_stable_focus() {
    let desktop = Desktop { release_at: 8, focus_at: 12, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Ok(()));
    assert_eq!(desktop.tick.get(), 13);
    assert_eq!(desktop.sends.get(), 1);
  }

  #[test]
  fn held_modifier_times_out_without_activation_or_input() {
    let desktop = Desktop { release_at: usize::MAX, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Err("selection-keys-held".into()));
    assert_eq!(desktop.tick.get(), 64);
    assert_eq!(desktop.activations.get(), 0);
    assert_eq!(desktop.sends.get(), 0);
  }

  #[test]
  fn clipboard_change_cancels_pending_input() {
    let desktop = Desktop { focus_at: 5, change_clipboard_at: 3, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Err("clipboard-changed".into()));
    assert_eq!(desktop.sends.get(), 0);
  }

  #[test]
  fn focus_loss_is_not_reactivated() {
    let desktop = Desktop { lose_focus_at: 1, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Err("target-focus-lost".into()));
    assert_eq!(desktop.activations.get(), 1);
    assert_eq!(desktop.sends.get(), 0);
  }

  #[test]
  fn missing_focus_has_a_bounded_wait() {
    let desktop = Desktop { focus_at: usize::MAX, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Err("target-focus-timeout".into()));
    assert_eq!(desktop.tick.get(), 32);
    assert_eq!(desktop.sends.get(), 0);
  }

  #[test]
  fn partial_or_rejected_input_is_never_retried() {
    let desktop = Desktop { reject_input: true, ..Desktop::default() };
    assert_eq!(deliver(&desktop), Err("input-rejected".into()));
    assert_eq!(desktop.sends.get(), 1);
  }
}
