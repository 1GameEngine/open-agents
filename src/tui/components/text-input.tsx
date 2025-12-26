import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCursorChange?: (position: number) => void;
  cursorPosition?: number;
  onUpArrow?: () => boolean | void;
  onDownArrow?: () => boolean | void;
  onTab?: () => boolean | void;
  onCtrlN?: () => boolean | void;
  onCtrlP?: () => boolean | void;
  onReturn?: () => boolean | void;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
};

/**
 * Find the position of the previous word boundary (for Option+Delete)
 */
function findPrevWordBoundary(value: string, cursorOffset: number): number {
  if (cursorOffset <= 0) return 0;

  let pos = cursorOffset - 1;

  // Skip any trailing whitespace
  while (pos > 0 && /\s/.test(value[pos]!)) {
    pos--;
  }

  // Skip the word characters
  while (pos > 0 && !/\s/.test(value[pos - 1]!)) {
    pos--;
  }

  return pos;
}

export function TextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onCursorChange,
  cursorPosition: externalCursorPosition,
  onUpArrow,
  onDownArrow,
  onTab,
  onCtrlN,
  onCtrlP,
  onReturn,
  placeholder = "",
  focus = true,
  showCursor = true
}: TextInputProps) {
  const [state, setState] = useState({
    cursorOffset: (originalValue || "").length,
    cursorWidth: 0
  });

  const { cursorOffset, cursorWidth } = state;

  // Sync with external cursor position when provided
  useEffect(() => {
    if (externalCursorPosition !== undefined) {
      setState((prev) => ({
        ...prev,
        cursorOffset: Math.min(externalCursorPosition, (originalValue || "").length),
        cursorWidth: 0
      }));
    }
  }, [externalCursorPosition, originalValue]);

  useEffect(() => {
    setState((previousState) => {
      if (!focus || !showCursor) {
        return previousState;
      }
      const newValue = originalValue || "";
      if (previousState.cursorOffset > newValue.length - 1) {
        return {
          cursorOffset: newValue.length,
          cursorWidth: 0
        };
      }
      return previousState;
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = cursorWidth;
  const value = originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  // Fake mouse cursor
  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");

    renderedValue = value.length > 0 ? "" : chalk.inverse(" ");

    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }

    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(" ");
    }
  }

  useInput(
    (input, key) => {
      // Handle up arrow - let parent intercept if needed
      if (key.upArrow) {
        if (onUpArrow?.()) return;
        return; // Still block if no handler
      }

      // Handle down arrow - let parent intercept if needed
      if (key.downArrow) {
        if (onDownArrow?.()) return;
        return; // Still block if no handler
      }

      // Handle tab - let parent intercept if needed
      if (key.tab && !key.shift) {
        if (onTab?.()) return;
        return; // Still block if no handler
      }

      // Handle Ctrl+N - let parent intercept if needed
      if (key.ctrl && input === "n") {
        if (onCtrlN?.()) return;
        // Don't block - allow default behavior if not handled
      }

      // Handle Ctrl+P - let parent intercept if needed
      if (key.ctrl && input === "p") {
        if (onCtrlP?.()) return;
        // Don't block - allow default behavior if not handled
      }

      // Ignore certain key combinations
      if (
        (key.ctrl && input === "c") ||
        (key.shift && key.tab)
      ) {
        return;
      }

      if (key.return) {
        // Let parent intercept return (e.g., for autocomplete)
        if (onReturn?.()) return;
        if (onSubmit) {
          onSubmit(originalValue);
        }
        return;
      }

      let nextCursorOffset = cursorOffset;
      let nextValue = originalValue;
      let nextCursorWidth = 0;

      if (key.leftArrow) {
        if (showCursor) {
          // Option+Left: Move to previous word boundary
          if (key.meta) {
            nextCursorOffset = findPrevWordBoundary(originalValue, cursorOffset);
          } else {
            nextCursorOffset--;
          }
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          // Option+Right: Move to next word boundary
          if (key.meta) {
            let pos = cursorOffset;
            // Skip current word
            while (pos < originalValue.length && !/\s/.test(originalValue[pos]!)) {
              pos++;
            }
            // Skip whitespace
            while (pos < originalValue.length && /\s/.test(originalValue[pos]!)) {
              pos++;
            }
            nextCursorOffset = pos;
          } else {
            nextCursorOffset++;
          }
        }
      } else if (key.ctrl && input === "u") {
        // Ctrl+U: Delete entire line to the left (Cmd+Delete equivalent)
        if (cursorOffset > 0) {
          nextValue = originalValue.slice(cursorOffset);
          nextCursorOffset = 0;
        }
      } else if (key.ctrl && input === "w") {
        // Ctrl+W: Delete previous word (unix-style, Option+Delete equivalent)
        if (cursorOffset > 0) {
          const wordBoundary = findPrevWordBoundary(
            originalValue,
            cursorOffset
          );
          nextValue =
            originalValue.slice(0, wordBoundary) +
            originalValue.slice(cursorOffset);
          nextCursorOffset = wordBoundary;
        }
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          // Option+Delete (meta + delete): Delete previous word
          // On macOS terminal, Option+Delete sends escape + delete (\x1b\x7f)
          // which results in key.delete = true and key.meta = true
          if (key.delete && key.meta) {
            const wordBoundary = findPrevWordBoundary(
              originalValue,
              cursorOffset
            );
            nextValue =
              originalValue.slice(0, wordBoundary) +
              originalValue.slice(cursorOffset);
            nextCursorOffset = wordBoundary;
          } else {
            // Regular backspace: delete one character
            nextValue =
              originalValue.slice(0, cursorOffset - 1) +
              originalValue.slice(cursorOffset, originalValue.length);
            nextCursorOffset--;
          }
        }
      } else {
        // Regular character input
        nextValue =
          originalValue.slice(0, cursorOffset) +
          input +
          originalValue.slice(cursorOffset, originalValue.length);
        nextCursorOffset += input.length;

        if (input.length > 1) {
          nextCursorWidth = input.length;
        }
      }

      // Clamp cursor position
      if (nextCursorOffset < 0) {
        nextCursorOffset = 0;
      }
      if (nextCursorOffset > nextValue.length) {
        nextCursorOffset = nextValue.length;
      }

      setState({
        cursorOffset: nextCursorOffset,
        cursorWidth: nextCursorWidth
      });

      // Notify parent of cursor position change
      if (nextCursorOffset !== cursorOffset) {
        onCursorChange?.(nextCursorOffset);
      }

      if (nextValue !== originalValue) {
        onChange(nextValue);
        // Also notify of cursor change when value changes
        onCursorChange?.(nextCursorOffset);
      }
    },
    { isActive: focus }
  );

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
