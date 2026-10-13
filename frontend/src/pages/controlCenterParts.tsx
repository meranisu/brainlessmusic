import type { ReactNode } from 'react';

/** Shared by the Control Center's Overview and Logs tabs. */

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      {/* h3: under the tab's own heading. */}
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {description && <p className="mt-0.5 mb-2 text-xs text-blue-300">{description}</p>}
      <div className={description ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-blue-300">
        {children}
      </td>
    </tr>
  );
}
