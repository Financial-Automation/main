import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Crown, Mail, Shield, Sparkles, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api";
import { getTrialExpiryLabel, isTrialExpired } from "@/lib/trial";
import { useSubscription } from "@/contexts/SubscriptionContext";

type UserProfile = {
  id: string;
  email: string;
  name?: string;
  subscriptionStatus?: "pending" | "active";
  subscriptionPlan?: "trial" | "monthly" | "annual" | "lifetime";
  subscriptionAmount?: number;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  trialEndDate?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerGSTIN?: string;
  sellerState?: string;
  sellerAddress?: string;
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  ifscCode?: string;
  authorisedSignature?: string;
  pendingDowngradePlan?: "monthly" | "annual" | "lifetime";
};

const planLabelMap: Record<NonNullable<UserProfile["subscriptionPlan"]>, string> = {
  trial: "Trial",
  monthly: "Monthly",
  annual: "Annual",
  lifetime: "Lifetime",
};

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: contextUser, loading: contextLoading, refreshUser } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerGSTIN, setSellerGSTIN] = useState("");
  const [sellerState, setSellerState] = useState("Tamil Nadu");
  const [sellerAddress, setSellerAddress] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("Current");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [authorisedSignature, setAuthorisedSignature] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contextUser) {
      setUser(contextUser);
      setDisplayName(contextUser.name?.trim() || contextUser.email.split("@")[0]);
      setEmail(contextUser.email);
      setSellerName(contextUser.sellerName || "");
      setSellerPhone(contextUser.sellerPhone || "");
      setSellerEmail(contextUser.sellerEmail || "");
      setSellerGSTIN(contextUser.sellerGSTIN || "");
      setSellerState(contextUser.sellerState || "Tamil Nadu");
      setSellerAddress(contextUser.sellerAddress || "");
      setBankName((contextUser as any).bankName || "");
      setAccountType((contextUser as any).accountType || "Current");
      setAccountNumber((contextUser as any).accountNumber || "");
      setIfscCode((contextUser as any).ifscCode || "");
      setAuthorisedSignature((contextUser as any).authorisedSignature || "");
      setLoading(false);
    }
  }, [contextUser]);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/auth");
    }
  }, [navigate]);

  const profileInitial = useMemo(() => {
    return (displayName || email || "U").charAt(0).toUpperCase();
  }, [displayName, email]);

  const selectedPlanLabel = user?.role === "admin" ? "Admin (Unlimited)" : (user?.subscriptionPlan ? planLabelMap[user.subscriptionPlan] : "Pending");
  const subscriptionAmount = user?.role === "admin" ? "Free (Enterprise License)" : (user?.subscriptionAmount ? `₹${user.subscriptionAmount.toLocaleString("en-IN")}` : "Not set");
  const trialExpiry = user?.role === "admin" ? "Lifetime Admin Access" : getTrialExpiryLabel(user?.trialEndDate);

  const handleCancelDowngrade = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/cancel-downgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to cancel downgrade.");
      const data = await res.json();
      setUser(data.user);
      await refreshUser();
      toast({
        title: "Downgrade Cancelled",
        description: "Your current subscription plan will renew normally."
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: err.message
      });
    }
  };

  const handleSave = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/auth");
      return;
    }

    setSaving(true);
    fetch(API_ENDPOINTS.UPDATE_PROFILE, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: displayName.trim(),
        email: email.trim(),
        sellerName: sellerName.trim(),
        sellerPhone: sellerPhone.trim(),
        sellerEmail: sellerEmail.trim(),
        sellerGSTIN: sellerGSTIN.trim(),
        sellerState: sellerState,
        sellerAddress: sellerAddress.trim(),
        bankName: bankName.trim(),
        accountType: accountType,
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim(),
        authorisedSignature: authorisedSignature.trim(),
      }),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || "Failed to update profile");
        }
        return payload as { message?: string; user?: UserProfile };
      })
      .then((payload) => {
        if (payload.user) {
          setUser(payload.user);
          setDisplayName(payload.user.name?.trim() || payload.user.email.split("@")[0]);
          setEmail(payload.user.email);
          setSellerName(payload.user.sellerName || "");
          setSellerPhone(payload.user.sellerPhone || "");
          setSellerEmail(payload.user.sellerEmail || "");
          setSellerGSTIN(payload.user.sellerGSTIN || "");
          setSellerState(payload.user.sellerState || "Tamil Nadu");
          setSellerAddress(payload.user.sellerAddress || "");
          setBankName((payload.user as any).bankName || "");
          setAccountType((payload.user as any).accountType || "Current");
          setAccountNumber((payload.user as any).accountNumber || "");
          setIfscCode((payload.user as any).ifscCode || "");
          setAuthorisedSignature((payload.user as any).authorisedSignature || "");
        }

        refreshUser();

        toast({
          title: "Profile updated",
          description: payload.message || "Your changes were saved to the database.",
        });
      })
      .catch((error) => {
        toast({
          title: "Save failed",
          description: error instanceof Error ? error.message : "Could not update profile",
          variant: "destructive",
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="dashboard-light min-h-screen text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="h-10 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <div>
              <p className="text-sm font-medium text-slate-500">Account</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile settings</h1>
            </div>
          </div>

          <Button
            type="button"
            className="h-10 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
            onClick={handleSave}
            disabled={saving}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-900 text-2xl font-semibold text-white">
                {profileInitial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">User profile</p>
                <h2 className="truncate text-2xl font-semibold text-slate-900">{loading ? "Loading..." : displayName}</h2>
                <p className="truncate text-sm text-slate-500">{email}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Display name</span>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                  placeholder="Your name"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Email address</span>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                  placeholder="name@example.com"
                />
              </label>
            </div>

            {/* Seller Details Section */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h3 className="text-md font-bold tracking-tight text-slate-805 uppercase tracking-[0.12em] text-xs mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-900"></span>
                Seller Details
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Seller Name *</span>
                  <Input
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Enter seller name"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Phone Number</span>
                  <Input
                    value={sellerPhone}
                    onChange={(e) => setSellerPhone(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Enter phone number"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Seller Email</span>
                  <Input
                    value={sellerEmail}
                    onChange={(e) => setSellerEmail(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="seller@example.com"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Seller GSTIN</span>
                  <Input
                    value={sellerGSTIN}
                    onChange={(e) => setSellerGSTIN(e.target.value.toUpperCase())}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Enter seller GSTIN"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Seller State</span>
                  <select
                    value={sellerState}
                    onChange={(e) => setSellerState(e.target.value)}
                    className="flex h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-offset-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Seller Address</span>
                  <Input
                    value={sellerAddress}
                    onChange={(e) => setSellerAddress(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Full seller address"
                  />
                </label>
              </div>
            </div>

            {/* Banking & Signature Details Section */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h3 className="text-md font-bold tracking-tight text-slate-805 uppercase tracking-[0.12em] text-xs mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-900"></span>
                Banking & Signature Details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Bank Name</span>
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="e.g. ABC Bank"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Account Type</span>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="flex h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-offset-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="Current">Current</option>
                    <option value="Savings">Savings</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Account Number</span>
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Account Number"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">IFSC Code</span>
                  <Input
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="e.g. ABCD0001234"
                  />
                </label>
              </div>

              <div className="mt-4">
                <label className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-505">Authorised Signatory Name</span>
                  <Input
                    value={authorisedSignature}
                    onChange={(e) => setAuthorisedSignature(e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-0"
                    placeholder="Authorised Signatory Name / Title"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <BadgeCheck className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">Status</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {user?.subscriptionStatus === "active" ? "Active" : "Pending"}
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Crown className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">Plan</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{selectedPlanLabel}</p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">Amount</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{subscriptionAmount}</p>
              </div>
            </div>

            {user?.pendingDowngradePlan && (
              <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col">
                  <p className="text-sm font-semibold text-amber-900">
                    Downgrade Scheduled
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your plan will automatically change to <strong className="capitalize">{user.pendingDowngradePlan}</strong> on your next billing cycle.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCancelDowngrade}
                  className="shrink-0 bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Cancel Downgrade
                </Button>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Subscription</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">Start date</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {user?.subscriptionStartDate || "Not available"}
                  </p>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">End date</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{trialExpiry || user?.subscriptionEndDate || "Not available"}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Security</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>Session access is tied to the current login token.</p>
                <p>Profile details come from your authenticated account record.</p>
                <p>Subscription details stay visible here for quick checking.</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-900 p-6 text-white shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Profile tip</p>
                  <p className="mt-1 text-sm text-white/80">Keep your name and email aligned with the login used for billing.</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
