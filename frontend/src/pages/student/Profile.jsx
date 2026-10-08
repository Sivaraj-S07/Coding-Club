import { useMemo, useRef, useState } from "react";
import {
  User,
  Hash,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Camera,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Building2,
  Users,
  Clock,
  CalendarRange,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { ApiError } from "../../lib/api";
import { passwordRuleResults, isStrongPassword } from "../../lib/passwordPolicy";
import { DEPARTMENTS, SECTIONS, getStartYearOptions, getEndYearOptions } from "../../lib/options";

const textInputCls = "field-input py-3 pl-10 pr-4 text-sm";
const selectCls = "field-input py-3 pl-10 pr-8 text-sm";
const BIO_MAX_LENGTH = 300;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // before resize — generous, since we downscale client-side
const AVATAR_SIZE = 320; // px, square

/** "2024-2028" -> ["2024", "2028"]. Falls back to ["", ""] for anything unparseable. */
function yearsFromBatch(batch) {
  const match = /^(\d{4})-(\d{4})$/.exec(String(batch || "").trim());
  if (!match) return ["", ""];
  return [match[1], match[2]];
}

/** Read a File, downscale it to a small square JPEG, and return a data URL. */
function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("That image is too large. Please choose a smaller file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load the image."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        // Cover-crop to a centered square so the photo isn't stretched.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function AvatarEditor({ avatarUrl, name, onChange, disabled }) {
  const { push } = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      push(err.message || "Failed to process image", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Profile"
            className="h-20 w-20 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-electric to-violet text-xl font-semibold text-void">
            {(name || "S").slice(0, 1).toUpperCase()}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2 className="h-5 w-5 animate-spin text-ink-100" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
          disabled={disabled || busy}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Camera}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          Change photo
        </Button>
        {avatarUrl && (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled || busy}
            className="inline-flex items-center gap-1.5 self-start text-xs text-ink-500 transition-colors hover:text-coral disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove photo
          </button>
        )}
      </div>
    </div>
  );
}

function ProfileDetailsCard() {
  const { student, updateProfile } = useStudentAccountAuth();
  const { push } = useToast();

  const [username, setUsername] = useState(student?.username || "");
  const [bio, setBio] = useState(student?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(student?.avatarUrl || "");
  const [department, setDepartment] = useState(student?.department || "");
  const [section, setSection] = useState(student?.section || "");
  const [mobileNumber, setMobileNumber] = useState(student?.mobileNumber || "");
  // Register Number is only ever collected here, once, during forced
  // Profile completion (Sign Up no longer asks for it). Once the account
  // has one, it becomes permanently fixed — the field below locks.
  const [registerNumber, setRegisterNumber] = useState(student?.registerNumber || "");
  const registerNumberLocked = Boolean(student?.registerNumber);
  const [[initialBatchStart, initialBatchEnd]] = useState(() => yearsFromBatch(student?.batch));
  const [batchStart, setBatchStart] = useState(initialBatchStart);
  const [batchEnd, setBatchEnd] = useState(initialBatchEnd);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const startYearOptions = useMemo(() => {
    const options = getStartYearOptions();
    // The student's current batch start might be older than the dropdown's
    // normal window (e.g. a senior updating their profile years later) —
    // keep it selectable even if it would otherwise have scrolled out.
    if (batchStart && !options.includes(batchStart)) {
      options.push(batchStart);
      options.sort((a, b) => Number(b) - Number(a));
    }
    return options;
  }, [batchStart]);

  const endYearOptions = useMemo(() => {
    const options = getEndYearOptions(batchStart);
    if (batchEnd && !options.includes(batchEnd)) {
      options.push(batchEnd);
      options.sort((a, b) => Number(a) - Number(b));
    }
    return options;
  }, [batchStart, batchEnd]);

  const courseDuration = useMemo(() => {
    const start = Number(batchStart);
    const end = Number(batchEnd);
    if (!start || !end || end <= start) return "";
    const years = end - start;
    return `${years} year${years === 1 ? "" : "s"}`;
  }, [batchStart, batchEnd]);

  const batch = batchStart && batchEnd ? `${batchStart}-${batchEnd}` : "";

  const dirty =
    username.trim() !== (student?.username || "") ||
    bio.trim() !== (student?.bio || "") ||
    avatarUrl !== (student?.avatarUrl || "") ||
    department !== (student?.department || "") ||
    section !== (student?.section || "") ||
    mobileNumber.trim() !== (student?.mobileNumber || "") ||
    batch !== (student?.batch || "") ||
    (!registerNumberLocked && registerNumber.trim() !== "");

  const handleBatchStartChange = (value) => {
    setBatchStart(value);
    setBatchEnd("");
  };

  const mobileNumberError = useMemo(() => {
    if (!mobileNumber) return "";
    if (!/^[0-9]+$/.test(mobileNumber)) return "Only digits (0-9) are allowed.";
    if (mobileNumber.length !== 10) return `Must be exactly 10 digits (${mobileNumber.length}/10).`;
    return "";
  }, [mobileNumber]);

  const registerNumberError = useMemo(() => {
    if (registerNumberLocked || !registerNumber) return "";
    if (!/^[0-9]+$/.test(registerNumber)) return "Only digits (0-9) are allowed.";
    if (registerNumber.length !== 12) return `Must be exactly 12 digits (${registerNumber.length}/12).`;
    return "";
  }, [registerNumber, registerNumberLocked]);

  const validate = () => {
    const errors = {};
    const trimmed = username.trim();
    if (!trimmed) {
      errors.username = "Username is required.";
    } else if (!/^[A-Za-z0-9._-]{3,30}$/.test(trimmed)) {
      errors.username = "3-30 characters: letters, numbers, dots, underscores or hyphens.";
    }
    if (bio.length > BIO_MAX_LENGTH) {
      errors.bio = `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`;
    }
    // Register Number and Mobile Number are the two fields forced-Profile-
    // completion cares about (Sign Up no longer collects either): once the
    // account doesn't have them yet, they're required here.
    if (!registerNumberLocked) {
      if (!registerNumber) {
        errors.registerNumber = "Register number is required.";
      } else if (!/^[0-9]{12}$/.test(registerNumber)) {
        errors.registerNumber = "Must be exactly 12 digits.";
      }
    }
    if (!mobileNumber) {
      errors.mobileNumber = "Mobile number is required.";
    } else if (!/^[0-9]{10}$/.test(mobileNumber)) {
      errors.mobileNumber = "Must be exactly 10 digits.";
    }
    // Department/section/batch are optional to fill in from Profile (unlike
    // Sign Up, where they're required) — only enforce that picking a batch
    // start year is followed through with an end year, so we never save a
    // half-finished selection.
    if (batchStart && !batchEnd) errors.batchEnd = "Please select your batch end year, or clear the start year.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !dirty) return;
    if (!validate()) return;

    setSaving(true);
    try {
      await updateProfile({
        username: username.trim(),
        bio: bio.trim(),
        avatarUrl,
        department,
        section,
        mobileNumber: mobileNumber.trim(),
        batch,
        // Only ever sent the first time — once it's set the field is
        // locked and never re-submitted, matching the backend's
        // "settable exactly once" rule.
        ...(registerNumberLocked ? {} : { registerNumber: registerNumber.trim() }),
      });
      push("Profile updated", "success");
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? err.details : null;
      push(details?.[0] || (err instanceof ApiError ? err.message : "Failed to update profile"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-100">Profile</h2>
        <p className="mt-1 text-sm text-ink-500">
          Update your photo, bio, username, department, section, mobile number, and batch.
        </p>
      </div>

      <AvatarEditor avatarUrl={avatarUrl} name={student?.name} onChange={setAvatarUrl} disabled={saving} />

      <div>
        <label htmlFor="profile-register" className="field-label">
          Register number {!registerNumberLocked && <span className="text-coral">*</span>}
        </label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-register"
            type="text"
            inputMode={registerNumberLocked ? undefined : "numeric"}
            maxLength={12}
            autoComplete="off"
            value={registerNumberLocked ? student?.registerNumber || "" : registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
            disabled={registerNumberLocked}
            readOnly={registerNumberLocked}
            aria-readonly={registerNumberLocked}
            placeholder={registerNumberLocked ? undefined : "12-digit register number"}
            aria-invalid={Boolean(fieldErrors.registerNumber || registerNumberError)}
            className={`${textInputCls} ${registerNumberLocked ? "cursor-not-allowed opacity-60" : ""}`}
          />
        </div>
        {registerNumberLocked ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Register number is fixed and cannot be changed.
          </p>
        ) : (
          (fieldErrors.registerNumber || registerNumberError) && (
            <p className="mt-1.5 text-xs text-coral">{fieldErrors.registerNumber || registerNumberError}</p>
          )
        )}
        {!registerNumberLocked && !fieldErrors.registerNumber && !registerNumberError && (
          <p className="mt-1.5 text-xs text-ink-600">You can only set this once — choose carefully.</p>
        )}
      </div>

      <div>
        <label htmlFor="profile-mobile" className="field-label">
          Mobile number <span className="text-coral">*</span>
        </label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-mobile"
            type="text"
            inputMode="numeric"
            maxLength={10}
            autoComplete="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            placeholder="10-digit mobile number"
            aria-invalid={Boolean(fieldErrors.mobileNumber || mobileNumberError)}
            className={textInputCls}
          />
        </div>
        {(fieldErrors.mobileNumber || mobileNumberError) && (
          <p className="mt-1.5 text-xs text-coral">{fieldErrors.mobileNumber || mobileNumberError}</p>
        )}
      </div>

      <div>
        <label htmlFor="profile-username" className="field-label">
          Username
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(fieldErrors.username)}
            className={textInputCls}
          />
        </div>
        {fieldErrors.username && <p className="mt-1.5 text-xs text-coral">{fieldErrors.username}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-department" className="field-label">
            Department
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <select
              id="profile-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-invalid={Boolean(fieldErrors.department)}
              className={selectCls}
            >
              <option value="">Select</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {fieldErrors.department && <p className="mt-1.5 text-xs text-coral">{fieldErrors.department}</p>}
        </div>

        <div>
          <label htmlFor="profile-section" className="field-label">
            Section
          </label>
          <div className="relative">
            <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <select
              id="profile-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              aria-invalid={Boolean(fieldErrors.section)}
              className={selectCls}
            >
              <option value="">Select</option>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {fieldErrors.section && <p className="mt-1.5 text-xs text-coral">{fieldErrors.section}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-batch-start" className="field-label">
            Batch start year
          </label>
          <div className="relative">
            <CalendarRange className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <select
              id="profile-batch-start"
              value={batchStart}
              onChange={(e) => handleBatchStartChange(e.target.value)}
              aria-invalid={Boolean(fieldErrors.batchStart)}
              className={selectCls}
            >
              <option value="">Select</option>
              {startYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {fieldErrors.batchStart && <p className="mt-1.5 text-xs text-coral">{fieldErrors.batchStart}</p>}
        </div>

        <div>
          <label htmlFor="profile-batch-end" className="field-label">
            Batch end year
          </label>
          <div className="relative">
            <CalendarRange className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <select
              id="profile-batch-end"
              value={batchEnd}
              onChange={(e) => setBatchEnd(e.target.value)}
              disabled={!batchStart}
              aria-invalid={Boolean(fieldErrors.batchEnd)}
              className={`${selectCls} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <option value="">{batchStart ? "Select" : "Pick start year first"}</option>
              {endYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {fieldErrors.batchEnd && <p className="mt-1.5 text-xs text-coral">{fieldErrors.batchEnd}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="profile-course-duration" className="field-label">
          Course duration
        </label>
        <div className="relative">
          <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-course-duration"
            type="text"
            value={courseDuration}
            disabled
            readOnly
            aria-readonly="true"
            placeholder="Pick both batch years"
            className={`${textInputCls} cursor-not-allowed opacity-60`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="profile-bio" className="field-label">
          Bio
        </label>
        <textarea
          id="profile-bio"
          rows={3}
          maxLength={BIO_MAX_LENGTH + 20}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the club a little about yourself..."
          aria-invalid={Boolean(fieldErrors.bio)}
          className="field-input py-3 px-4 text-sm"
        />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className={fieldErrors.bio ? "text-coral" : "text-ink-600"}>
            {fieldErrors.bio || " "}
          </span>
          <span className={bio.length > BIO_MAX_LENGTH ? "text-coral" : "text-ink-600"}>
            {bio.length}/{BIO_MAX_LENGTH}
          </span>
        </div>
      </div>

      <Button type="submit" disabled={saving || !dirty}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function PasswordCard() {
  const { changePassword } = useStudentAccountAuth();
  const { push } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const passwordRules = useMemo(() => passwordRuleResults(newPassword), [newPassword]);
  const passwordStrong = useMemo(() => isStrongPassword(newPassword), [newPassword]);

  const validate = () => {
    const errors = {};
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    if (!passwordStrong) errors.newPassword = "New password does not meet all requirements below.";
    if (confirmPassword !== newPassword) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      push("Password updated", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTouched(false);
      setFieldErrors({});
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? err.details : null;
      push(details?.[0] || (err instanceof ApiError ? err.message : "Failed to change password"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-100">Password</h2>
        <p className="mt-1 text-sm text-ink-500">Change your account password.</p>
      </div>

      <div>
        <label htmlFor="profile-current-password" className="field-label">
          Current password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-current-password"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.currentPassword)}
            className="field-input py-3 pl-10 pr-11 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            tabIndex={-1}
            aria-label={showCurrent ? "Hide password" : "Show password"}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.currentPassword && <p className="mt-1.5 text-xs text-coral">{fieldErrors.currentPassword}</p>}
      </div>

      <div>
        <label htmlFor="profile-new-password" className="field-label">
          New password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-new-password"
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onFocus={() => setTouched(true)}
            aria-invalid={Boolean(fieldErrors.newPassword)}
            className="field-input py-3 pl-10 pr-11 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            tabIndex={-1}
            aria-label={showNew ? "Hide password" : "Show password"}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {touched && (
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {passwordRules.map((rule) => (
              <li
                key={rule.key}
                className={`flex items-center gap-1.5 text-[11px] ${rule.passed ? "text-mint" : "text-ink-500"}`}
              >
                {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {rule.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="profile-confirm-password" className="field-label">
          Confirm new password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            id="profile-confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            className="field-input py-3 pl-10 pr-11 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            tabIndex={-1}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.confirmPassword && <p className="mt-1.5 text-xs text-coral">{fieldErrors.confirmPassword}</p>}
      </div>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

export default function Profile() {
  const { student, profileComplete } = useStudentAccountAuth();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow">
          <User className="h-5 w-5 text-void" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">Your profile</h1>
          <p className="mt-1 text-sm text-ink-500">
            {student?.name || student?.username ? `Signed in as ${student.name || student.username}` : "Manage your account"}
          </p>
        </div>
      </div>

      {!profileComplete && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-electric/30 bg-electric/[0.06] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
          <div>
            <p className="text-sm font-medium text-ink-100">Finish setting up your profile</p>
            <p className="mt-1 text-xs text-ink-400">
              Add your Register Number and Mobile Number below to unlock the Dashboard and the rest of the site.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-6">
        <ProfileDetailsCard />
        <PasswordCard />
      </div>
    </div>
  );
}
