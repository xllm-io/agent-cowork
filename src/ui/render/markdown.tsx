import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

export default function MDContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={{
        h1: (props) => <h1 className="mt-3 text-lg font-semibold text-ink-900" {...props} />,
        h2: (props) => <h2 className="mt-2 text-base font-semibold text-ink-900" {...props} />,
        h3: (props) => <h3 className="mt-2 text-sm font-semibold text-ink-800" {...props} />,
        p: (props) => <p className="mt-2 text-[15px] leading-[1.7] text-ink-700 first:mt-0 last:mb-0" {...props} />,
        ul: (props) => <ul className="mt-2 ml-4 flex list-disc flex-col gap-1" {...props} />,
        ol: (props) => <ol className="mt-2 ml-4 flex list-decimal flex-col gap-1" {...props} />,
        li: (props) => <li className="min-w-0 text-[15px] leading-[1.7] text-ink-700" {...props} />,
        strong: (props) => <strong className="text-ink-900 font-semibold" {...props} />,
        em: (props) => <em className="text-ink-800" {...props} />,
        pre: (props) => (
          <pre
            className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-tertiary p-3 text-[13px] leading-[1.5] text-ink-700"
            {...props}
          />
        ),
        code: (props) => {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !String(children).includes("\n");

          return isInline ? (
            <code className="rounded bg-surface-tertiary px-1.5 py-0.5 text-accent font-mono text-xs" {...rest}>
              {children}
            </code>
          ) : (
            <code className={`${className} font-mono`} {...rest}>
              {children}
            </code>
          );
        },
        table: ({ children }) => (
          <div className="my-3 -mx-1 overflow-x-auto rounded-xl border border-ink-900/5 bg-surface-secondary">
            <table className="w-full min-w-[320px] border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: (props) => (
          <thead className="border-b border-ink-900/10 bg-surface-tertiary" {...props} />
        ),
        th: (props) => (
          <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-700" {...props} />
        ),
        td: (props) => (
          <td className="whitespace-nowrap px-4 py-2.5 text-ink-600 first:text-ink-700" {...props} />
        ),
      }}
    >
      {String(text ?? "")}
    </ReactMarkdown>
  )
}
