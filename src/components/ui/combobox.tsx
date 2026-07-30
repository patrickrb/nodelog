"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxOption {
  value: string
  label: string
  secondary?: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyText = "No option found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)
  
  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const searchLower = search.toLowerCase()
    return options.filter(option => 
      option.label.toLowerCase().includes(searchLower) ||
      option.secondary?.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedOption ? (
              <span>
                {selectedOption.label}
                {selectedOption.secondary && (
                  <span className="ml-2 text-fg-2">
                    ({selectedOption.secondary})
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="border-b border-line px-3 py-2">
          <input
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore=""
            data-form-type="other"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-fg-2">
              {emptyText}
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className="relative flex cursor-pointer select-none items-center rounded-[6px] px-2 py-1.5 text-sm outline-none hover:bg-accent-soft hover:text-accent-hi"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === option.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.secondary && (
                    <span className="text-xs text-fg-2">
                      {option.secondary}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}