import AIAssistant from "@/components/AIAssistant";

export default function WidgetPage() {
    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "transparent" }}>
            <AIAssistant isWidget={true} />
        </div>
    );
}
