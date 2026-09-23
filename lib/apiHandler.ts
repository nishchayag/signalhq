import { NextRequest, NextResponse } from "next/server";

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/**
 * Wrap a route handler so an unexpected throw becomes a JSON error response
 * instead of an unhandled 500. Generic over the route context so Next's
 * `{ params: Promise<...> }` typing still type-checks.
 *
 * - SyntaxError (malformed JSON body from request.json()) → 400
 * - Mongoose CastError (id/value that can't be cast)       → 404
 * - anything else                                          → logged 500
 */
export function withErrorHandling<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, message: "Invalid request body" },
          { status: 400 }
        );
      }
      if ((error as { name?: string })?.name === "CastError") {
        return NextResponse.json(
          { success: false, message: "Not found" },
          { status: 404 }
        );
      }
      console.error(`Unhandled error in ${request.method} ${request.nextUrl.pathname}:`, error);
      return NextResponse.json(
        { success: false, message: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
