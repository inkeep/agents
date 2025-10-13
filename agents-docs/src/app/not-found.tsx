export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-4 text-muted-foreground">Page not found</p>
      <a href="/" className="mt-8 text-primary hover:underline">
        Go back home
      </a>
    </div>
  );
}
