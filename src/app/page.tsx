import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <Link className="text-xl font-bold tracking-tight text-[var(--brand)]" href="/">
          UAEHub
        </Link>
        <Link
          className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium"
          href={session?.user?.id ? "/app" : "/login"}
        >
          {session?.user?.id ? "进入我的圈子" : "登录 / 注册"}
        </Link>
      </nav>

      <section className="mx-auto grid max-w-5xl gap-10 py-20 md:grid-cols-[1.15fr_0.85fr] md:py-32">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-[var(--brand-soft)] px-3 py-1 text-sm font-medium text-[var(--brand)]">
            为小而亲密的生活圈子而生
          </p>
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            把约饭、推荐和 AA
            <br />
            放回你的圈子里。
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
            UAEHub 让每个圈子独立管理成员、资料可见性、餐厅推荐、活动与账单。信息只在获得批准的成员之间流动。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="rounded-full bg-[var(--brand)] px-5 py-3 font-semibold text-white" href={session?.user?.id ? "/app" : "/login?mode=register"}>
              创建或加入圈子
            </Link>
            <Link className="rounded-full border border-[var(--line)] bg-white px-5 py-3 font-semibold" href="/login">
              已有账户，去登录
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm font-semibold text-[var(--brand)]">一个圈子，一条清晰边界</p>
          <div className="mt-6 space-y-4">
            {[
              ["资料由你决定", "手机号、IBAN、生日按圈子逐项公开。"],
              ["活动不再靠刷群", "报名、候补、提醒和调整记录都在一起。"],
              ["账单不再手算", "支持均分、不等额、比例和份数分摊。"],
            ].map(([title, text]) => (
              <div className="rounded-2xl bg-[#f4f6f1] p-4" key={title}>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
