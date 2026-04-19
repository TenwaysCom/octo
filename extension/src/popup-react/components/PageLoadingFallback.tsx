import { PopupPage } from "./PopupPage.js";
import { UiCard } from "./UiCard.js";
import { Skeleton } from "./ui/skeleton.js";

export function PageLoadingFallback({
  title = "加载中",
  subtitle = "正在准备页面内容。",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <PopupPage title={title} subtitle={subtitle}>
      <UiCard title="页面骨架">
        <div className="grid gap-3" data-test="lazy-page-fallback">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </UiCard>
    </PopupPage>
  );
}
