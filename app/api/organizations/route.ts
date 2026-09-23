import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import { createOrganizationSchema } from "@/schemas/organizationSchema";
import { listUserOrganizations } from "@/lib/orgContext";
import { uniqueSlug } from "@/lib/slug";
import { checkRateLimit } from "@/lib/rateLimit";

// GET /api/organizations — organizations the current user belongs to.
export async function GET() {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const organizations = await listUserOrganizations(session.user._id);
    return NextResponse.json(
      { success: true, organizations, activeOrgId: session.user.activeOrgId },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error listing organizations:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/organizations — create a new org; creator becomes OWNER.
export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Each org claims a globally-unique slug; cap creation so one account
    // can't squat slugs in bulk.
    const allowed = await checkRateLimit(`createOrg:${session.user._id}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, message: "Too many organizations created. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const result = createOrganizationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid input",
          errors: result.error.format(),
        },
        { status: 400 }
      );
    }

    const slug = await uniqueSlug(result.data.name, OrganizationModel);

    const organization = await OrganizationModel.create({
      name: result.data.name,
      slug,
      createdBy: session.user._id,
    });

    await MembershipModel.create({
      organizationId: organization._id,
      userId: session.user._id,
      role: "OWNER",
    });

    return NextResponse.json(
      {
        success: true,
        message: "Organization created",
        organization: {
          _id: organization._id,
          name: organization.name,
          slug: organization.slug,
          role: "OWNER",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating organization:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
