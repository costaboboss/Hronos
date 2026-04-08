import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import TrackingPage from "./pages/TrackingPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TagsPage from "./pages/TagsPage";
import LoginPage from "./pages/LoginPage";
import TardisDocumentPage from "./pages/TardisDocumentPage";
import TardisPage from "./pages/TardisPage";
import DashboardLayout from "./components/DashboardLayout";
import TrainingPage from "./pages/TrainingPage";
import { useAuth } from "./_core/hooks/useAuth";

function AuthenticatedApp() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={TrackingPage} />
        <Route path="/tracking" component={TrackingPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/tags" component={TagsPage} />
        <Route path="/training" component={TrainingPage} />
        <Route path="/tardis" component={TardisPage} />
        <Route path="/tardis/doc/:id" component={TardisDocumentPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AuthenticatedApp />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
