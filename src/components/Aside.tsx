interface AsideProps {
	children: React.ReactNode;
}

export default function Aside({ children }: AsideProps) {
	return (
		<aside className="my-6 pl-4 border-l-2 border-zinc-700 text-zinc-400 text-sm italic">
			{children}
		</aside>
	);
}

