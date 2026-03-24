"use client";

import React, { useMemo } from "react";
import {
  Combobox,
  createListCollection,
  useComboboxContext,
} from "@chakra-ui/react";

export type LangOption = { value: string | undefined; name: string };

type Item = { label: string; value: string };

function FilteredComboboxItems({ items }: { items: Item[] }) {
  const ctx = useComboboxContext();
  const inputValue = (ctx as { inputValue?: string }).inputValue ?? "";
  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, inputValue]);

  return (
    <>
      <Combobox.Empty>No matches</Combobox.Empty>
      {filtered.map((item) => (
        <Combobox.Item key={item.value} item={item}>
          {item.label}
        </Combobox.Item>
      ))}
    </>
  );
}

type Props = {
  options: LangOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function SearchableLanguageSelect({
  options,
  value,
  onChange,
  placeholder,
}: Props) {
  const items = useMemo(() => {
    const result: Item[] = [];
    let addedNone = false;
    for (const opt of options) {
      const val = opt.value ?? "NOTRANSLATION";
      if (val === "NOTRANSLATION" || val === "") {
        if (addedNone) continue;
        addedNone = true;
        result.push({ label: "No translation", value: "NOTRANSLATION" });
      } else {
        result.push({ label: opt.name, value: val });
      }
    }
    return result.sort((a, b) => {
      if (a.value === "NOTRANSLATION") return -1;
      if (b.value === "NOTRANSLATION") return 1;
      return a.label.localeCompare(b.label);
    });
  }, [options]);

  const collection = useMemo(() => createListCollection({ items }), [items]);

  const selectedValues = value ? [value] : [];

  return (
    <Combobox.Root
      collection={collection}
      value={selectedValues}
      onValueChange={(e) => onChange(e.value[0] ?? "NOTRANSLATION")}
      openOnClick
      closeOnSelect
      selectionBehavior="replace"
      placeholder={placeholder}
      className="form-combobox"
      size="md"
      positioning={{ strategy: "fixed", hideWhenDetached: true }}
    >
      <Combobox.Control>
        <Combobox.Input />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content>
          <FilteredComboboxItems items={items} />
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  );
}
