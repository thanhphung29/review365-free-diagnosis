import { setRequestLocale } from 'next-intl/server';
import { ReportApp } from '@/components/ReportApp';

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportApp />;
}
