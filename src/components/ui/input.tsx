import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-[10px] border border-line-hi bg-bg-1 text-fg placeholder:text-fg-3 transition-all outline-none focus:border-accent focus:bg-bg-2 focus:ring-4 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
  {
    variants: {
      size: {
        default: "h-12 px-4 text-base",
        sm: "h-10 px-3 text-sm",
        lg: "px-5 py-[18px] text-[22px] font-semibold tracking-[0.02em]",
        xl: "px-6 py-5 text-[36px] font-semibold tracking-[0.02em] uppercase",
      },
      mono: {
        true: "font-mono",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      mono: false,
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, mono, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ size, mono, className }))}
        ref={ref}
        // Suppress password-manager autofill UI by default — this app is
        // ham-radio data, not credentials. Auth forms pass an explicit
        // autoComplete value (e.g. "email", "current-password") which
        // overrides via prop spread below.
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore=""
        data-form-type="other"
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
