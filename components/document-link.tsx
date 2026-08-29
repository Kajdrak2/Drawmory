import type { ComponentPropsWithoutRef } from 'react';

type DocumentLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  href: string;
};

/**
 * Uses a full-page navigation so links remain reliable in the hosted Vinext runtime.
 */
export function DocumentLink({ href, ...props }: DocumentLinkProps) {
  return <a href={href} {...props} />;
}
