import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { Box, Text, useInput } from "ink";
import { TextInput } from "./text-input.js";
import { Suggestions, type Suggestion } from "./suggestions.js";
import { getFileSuggestions, extractMention } from "../lib/file-suggestions.js";
import type { AutoAcceptMode } from "../types.js";

type InputBoxProps = {
  onSubmit: (value: string) => void;
  autoAcceptMode: AutoAcceptMode;
  onToggleAutoAccept: () => void;
  disabled?: boolean;
};

function getAutoAcceptLabel(mode: AutoAcceptMode): string {
  switch (mode) {
    case "off":
      return "auto-accept off";
    case "edits":
      return "auto-accept edits on";
    case "all":
      return "auto-accept all on";
  }
}

function getAutoAcceptColor(mode: AutoAcceptMode): string {
  switch (mode) {
    case "off":
      return "gray";
    case "edits":
      return "green";
    case "all":
      return "yellow";
  }
}

// Memoized auto-accept indicator
const AutoAcceptIndicator = memo(function AutoAcceptIndicator({
  mode
}: {
  mode: AutoAcceptMode;
}) {
  return (
    <Box marginTop={0}>
      <Text color={getAutoAcceptColor(mode)}>
        ▸▸ {getAutoAcceptLabel(mode)}
      </Text>
      <Text color="gray"> (shift+tab to cycle)</Text>
    </Box>
  );
});

export const InputBox = memo(function InputBox({
  onSubmit,
  autoAcceptMode,
  onToggleAutoAccept,
  disabled = false
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionInfo, setMentionInfo] = useState<{
    mentionStart: number;
    partialPath: string;
  } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useInput((input, key) => {
    // Shift+Tab to cycle auto-accept modes
    if (key.shift && key.tab) {
      onToggleAutoAccept();
    }
    // Escape to close suggestions
    if (key.escape && suggestions.length > 0) {
      setSuggestions([]);
      setMentionInfo(null);
    }
  });

  // Update suggestions when cursor position or value changes (debounced)
  useEffect(() => {
    const mention = extractMention(value, cursorPosition);
    setMentionInfo(mention);

    if (!mention) {
      setSuggestions([]);
      return;
    }

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the suggestions fetch
    debounceRef.current = setTimeout(() => {
      getFileSuggestions(mention.partialPath).then((results) => {
        setSuggestions(results);
        setSelectedIndex(0);
      });
    }, 100);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, cursorPosition]);

  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const handleCursorChange = useCallback((position: number) => {
    setCursorPosition(position);
  }, []);

  const handleUpArrow = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
      return true; // Consumed the event
    }
    return false;
  }, [suggestions.length]);

  const handleDownArrow = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
      return true; // Consumed the event
    }
    return false;
  }, [suggestions.length]);

  const handleCtrlN = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
      return true; // Consumed the event
    }
    return false;
  }, [suggestions.length]);

  const handleCtrlP = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
      return true; // Consumed the event
    }
    return false;
  }, [suggestions.length]);

  const selectSuggestion = useCallback(() => {
    if (suggestions.length > 0 && mentionInfo) {
      const selected = suggestions[selectedIndex];
      if (selected) {
        // Replace the partial path with the selected suggestion + space
        const before = value.slice(0, mentionInfo.mentionStart + 1); // Include @
        const after = value.slice(cursorPosition);
        const newValue = before + selected.value + " " + after;
        setValue(newValue);
        // Update cursor position to after the space
        const newCursorPos = mentionInfo.mentionStart + 1 + selected.value.length + 1;
        setCursorPosition(newCursorPos);
        // Close suggestions after selection
        setSuggestions([]);
        setMentionInfo(null);
        return true; // Consumed the event
      }
    }
    return false;
  }, [suggestions, selectedIndex, mentionInfo, value, cursorPosition]);

  const handleTab = useCallback(() => {
    return selectSuggestion();
  }, [selectSuggestion]);

  const handleReturn = useCallback(() => {
    return selectSuggestion();
  }, [selectSuggestion]);

  const handleSubmit = useCallback(
    (submitValue: string) => {
      if (submitValue.trim() && !disabled) {
        onSubmit(submitValue.trim());
        setValue("");
        setCursorPosition(0);
        setSuggestions([]);
        setMentionInfo(null);
      }
    },
    [disabled, onSubmit]
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Input line */}
      <Box
        borderStyle="round"
        borderColor={disabled ? "gray" : "white"}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text color={disabled ? "gray" : "white"}>&gt; </Text>
        {disabled ? (
          <Text color="gray">Waiting...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleValueChange}
            onSubmit={handleSubmit}
            onCursorChange={handleCursorChange}
            cursorPosition={cursorPosition}
            onUpArrow={handleUpArrow}
            onDownArrow={handleDownArrow}
            onTab={handleTab}
            onCtrlN={handleCtrlN}
            onCtrlP={handleCtrlP}
            onReturn={handleReturn}
            placeholder=""
          />
        )}
      </Box>

      {/* Suggestions dropdown (below input) */}
      <Suggestions
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        visible={suggestions.length > 0}
      />

      {/* Auto-accept indicator */}
      <AutoAcceptIndicator mode={autoAcceptMode} />
    </Box>
  );
});
