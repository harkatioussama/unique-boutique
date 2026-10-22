import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { CatalogSyncNotice, StoreProvider } from '@/context/StoreContext';
import { Header, Footer } from '@/components/Shell';
import {
  AboutPage, CarePage, CartPage, CollectionPage, CollectionsPage, ContactPage,
  FaqPage, HomePage, NotFoundPage, PrivacyPage, ProductPage, ShippingPage,
  ShopPage, TermsPage, WishlistPage,
} from '@/pages/StorePages';
const AdminLoginPage = lazy(() =>
  import('./admin/AdminPages.tsx').then((module) => ({
    default: module.AdminLoginPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  import('./admin/AdminDashboard.tsx').then((module) => ({
    default: module.AdminDashboardPage,
  })),
);

const queryClient = new QueryClient();

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}


function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/admin/login">
          <Suspense fallback={<main className="min-h-screen bg-slate-950 p-8 text-white">Loading...</main>}>
            <AdminLoginPage />
          </Suspense>
        </Route>

        <Route path="/admin">
          <Suspense fallback={<main className="min-h-screen bg-slate-950 p-8 text-white">Loading...</main>}>
            <AdminDashboardPage />
          </Suspense>
        </Route>

        <Route>
          <div className="site-shell">
            <CatalogSyncNotice />
            <Header />
            <Switch>
              <Route path="/" component={HomePage} />
              <Route path="/shop" component={ShopPage} />
              <Route path="/product/:slug" component={ProductPage} />
              <Route path="/collections" component={CollectionsPage} />
              <Route path="/collections/:slug" component={CollectionPage} />
              <Route path="/cart" component={CartPage} />
              <Route path="/wishlist" component={WishlistPage} />
              <Route path="/about" component={AboutPage} />
              <Route path="/care-guide" component={CarePage} />
              <Route path="/faq" component={FaqPage} />
              <Route path="/contact" component={ContactPage} />
              <Route path="/shipping-returns" component={ShippingPage} />
              <Route path="/privacy" component={PrivacyPage} />
              <Route path="/terms" component={TermsPage} />
              <Route component={NotFoundPage} />
            </Switch>
            <Footer />
          </div>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </StoreProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
