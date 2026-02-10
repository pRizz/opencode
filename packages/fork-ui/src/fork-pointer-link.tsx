import { ComponentProps, splitProps } from "solid-js"

export interface ForkPointerLinkProps extends ComponentProps<"a"> {}

export function ForkPointerLink(props: ForkPointerLinkProps) {
  const [local, rest] = splitProps(props, ["href", "target", "rel", "style", "children"])

  const isExternal = () => /^https?:\/\//i.test(local.href ?? "")

  const style = () => {
    if (typeof local.style === "string") return `cursor: pointer; ${local.style}`
    return { cursor: "pointer", ...(local.style ?? {}) }
  }

  const target = () => local.target ?? (isExternal() ? "_blank" : undefined)
  const rel = () => local.rel ?? (isExternal() ? "noopener noreferrer" : undefined)

  return (
    <a href={local.href} target={target()} rel={rel()} style={style()} {...rest}>
      {local.children}
    </a>
  )
}
