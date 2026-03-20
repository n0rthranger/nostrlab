interface Props {
  patch: string;
}

export default function DiffView({ patch }: Props) {
  const lines = patch.split("\n");

  return (
    <div className="font-mono text-xs overflow-x-auto border border-border rounded-lg">
      {lines.map((line, i) => {
        let bg = "";
        let textColor = "text-text-primary";

        if (line.startsWith("+") && !line.startsWith("+++")) {
          bg = "bg-green-subtle";
          textColor = "text-green";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          bg = "bg-red-subtle";
          textColor = "text-red";
        } else if (line.startsWith("@@")) {
          textColor = "text-accent";
          bg = "bg-accent/5";
        } else if (
          line.startsWith("diff ") ||
          line.startsWith("index ") ||
          line.startsWith("---") ||
          line.startsWith("+++")
        ) {
          textColor = "text-text-muted";
        }

        return (
          <div key={i} className={`px-4 py-0 whitespace-pre ${bg} ${textColor}`}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
