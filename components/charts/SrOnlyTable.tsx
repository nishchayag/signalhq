/**
 * The accessibility twin of every chart (dataviz skill): every value a
 * chart shows is also reachable as plain text, not just through a hover
 * tooltip. Visually hidden (`sr-only`) but present in the DOM for screen
 * readers; values come from typed data, never innerHTML.
 */
export default function SrOnlyTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
