import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
    src?: string;
    alt?: string;
    fallback?: string;
    size?: "sm" | "md" | "lg";
}

function Avatar({ className, src, alt, fallback, size = "md", ...props }: AvatarProps) {
    const sizes = {
        sm: "h-8 w-8 text-xs",
        md: "h-10 w-10 text-sm",
        lg: "h-12 w-12 text-base",
    };

    const [imageError, setImageError] = React.useState(false);

    if (src && !imageError) {
        return (
            <div className={cn("relative rounded-full overflow-hidden", sizes[size], className)} {...props}>
                <img
                    src={src}
                    alt={alt || "Avatar"}
                    className="h-full w-full object-cover"
                    onError={() => setImageError(true)}
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-semibold",
                sizes[size],
                className
            )}
            {...props}
        >
            {fallback?.charAt(0).toUpperCase() || "?"}
        </div>
    );
}

export { Avatar };
