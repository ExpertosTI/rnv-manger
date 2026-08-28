#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def create_renace_icon(size=1024):
    # Crear lienzo transparente con antialiasing
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Fondo squircle redondeado con gradiente profundo Renace
    margin = int(size * 0.04)
    radius = int(size * 0.22)
    bg_box = [margin, margin, size - margin, size - margin]
    
    # Base oscura con brillo violeta
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    
    # Fondo con gradiente sutil de arriba a abajo
    for y in range(margin, size - margin):
        factor = (y - margin) / (size - 2 * margin)
        # De #15102a (violeta oscuro) a #080611 (negro casi puro)
        r = int(21 * (1 - factor) + 8 * factor)
        g = int(16 * (1 - factor) + 6 * factor)
        b = int(42 * (1 - factor) + 17 * factor)
        bg_draw.line([(margin, y), (size - margin, y)], fill=(r, g, b, 255))
        
    # Crear máscara de squircle redondeado
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(bg_box, radius=radius, fill=255)
    
    # Aplicar máscara al fondo
    img.paste(bg, (0, 0), mask)
    
    # 2. Borde sutil con glow violeta/cian
    border_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border_img)
    border_draw.rounded_rectangle(bg_box, radius=radius, outline=(139, 92, 246, 180), width=int(size * 0.015))
    img = Image.alpha_composite(img, border_img)
    
    # 3. Dibujar el Isotipo Renace (Escudo dinámico / Pirámide de energía)
    center_x = size / 2
    center_y = size / 2
    
    # Capa de resplandor (Glow)
    glow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    
    glow_box = [center_x - size*0.35, center_y - size*0.35, center_x + size*0.35, center_y + size*0.35]
    glow_draw.ellipse(glow_box, fill=(124, 58, 237, 120))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(int(size * 0.08)))
    img = Image.alpha_composite(img, glow_img)
    
    # Capa del Isotipo Renace
    crest_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    crest_draw = ImageDraw.Draw(crest_img)
    
    # Triángulo / Cresta exterior
    top = (center_x, center_y - size * 0.28)
    bottom_left = (center_x - size * 0.26, center_y + size * 0.26)
    bottom_right = (center_x + size * 0.26, center_y + size * 0.26)
    
    # Gradiente de cresta
    crest_draw.polygon([top, bottom_right, bottom_left], fill=(99, 102, 241, 240))
    
    # Triángulo interior estilizado con violeta vibrante
    inner_top = (center_x, center_y - size * 0.18)
    inner_bl = (center_x - size * 0.18, center_y + size * 0.18)
    inner_br = (center_x + size * 0.18, center_y + size * 0.18)
    crest_draw.polygon([inner_top, inner_br, inner_bl], fill=(168, 85, 247, 255))
    
    # Rayo / Chispa de energía central (Simbolizando monitoreo activo & potencia)
    spark_points = [
        (center_x + size * 0.02, center_y - size * 0.20),
        (center_x - size * 0.08, center_y + size * 0.02),
        (center_x, center_y + size * 0.02),
        (center_x - size * 0.02, center_y + size * 0.20),
        (center_x + size * 0.08, center_y - size * 0.02),
        (center_x, center_y - size * 0.02),
    ]
    crest_draw.polygon(spark_points, fill=(255, 255, 255, 255))
    
    # Núcleo de monitoreo (ojo/nodo central de red en cian brillante)
    node_center = (center_x, center_y + size * 0.02)
    crest_draw.ellipse([node_center[0] - size*0.04, node_center[1] - size*0.04, node_center[0] + size*0.04, node_center[1] + size*0.04], fill=(56, 189, 248, 255))
    
    img = Image.alpha_composite(img, crest_img)
    return img

def main():
    print("🎨 Generando identidad visual y logotipo de alta resolución para Renace...")
    master = create_renace_icon(1024)
    
    # 1. Guardar en public/
    os.makedirs("public", exist_ok=True)
    master.save("public/logo.png", "PNG")
    master.resize((192, 192), Image.Resampling.LANCZOS).save("public/logo-192.png", "PNG")
    master.resize((512, 512), Image.Resampling.LANCZOS).save("public/logo-512.png", "PNG")
    master.resize((32, 32), Image.Resampling.LANCZOS).save("public/favicon.ico", format="ICO")
    print("✅ Guardados logos en public/")
    
    # 2. Guardar iconos de macOS (Tauri)
    os.makedirs("src-tauri/icons", exist_ok=True)
    master.resize((32, 32), Image.Resampling.LANCZOS).save("src-tauri/icons/32x32.png", "PNG")
    master.resize((128, 128), Image.Resampling.LANCZOS).save("src-tauri/icons/128x128.png", "PNG")
    master.resize((256, 256), Image.Resampling.LANCZOS).save("src-tauri/icons/128x128@2x.png", "PNG")
    master.resize((512, 512), Image.Resampling.LANCZOS).save("src-tauri/icons/icon.png", "PNG")
    master.resize((32, 32), Image.Resampling.LANCZOS).save("src-tauri/icons/icon.ico", format="ICO")
    print("✅ Guardados iconos en src-tauri/icons/")
    
    # 3. Guardar iconos de Android (Capacitor)
    android_res = "android/app/src/main/res"
    if os.path.exists(android_res):
        sizes = {
            "mipmap-mdpi": 48,
            "mipmap-hdpi": 72,
            "mipmap-xhdpi": 96,
            "mipmap-xxhdpi": 144,
            "mipmap-xxxhdpi": 192
        }
        for folder, sz in sizes.items():
            dirpath = os.path.join(android_res, folder)
            os.makedirs(dirpath, exist_ok=True)
            icon_sz = master.resize((sz, sz), Image.Resampling.LANCZOS)
            icon_sz.save(os.path.join(dirpath, "ic_launcher.png"), "PNG")
            icon_sz.save(os.path.join(dirpath, "ic_launcher_round.png"), "PNG")
            icon_sz.save(os.path.join(dirpath, "ic_launcher_foreground.png"), "PNG")
        
        # Splash screens
        splash_bg = Image.new("RGBA", (1080, 1920), (11, 10, 16, 255))
        logo_splash = master.resize((320, 320), Image.Resampling.LANCZOS)
        splash_bg.paste(logo_splash, (int((1080-320)/2), int((1920-320)/2 - 80)), logo_splash)
        
        splash_dirs = [
            "drawable", "drawable-port-mdpi", "drawable-port-hdpi",
            "drawable-port-xhdpi", "drawable-port-xxhdpi", "drawable-port-xxxhdpi"
        ]
        for sdir in splash_dirs:
            p = os.path.join(android_res, sdir)
            os.makedirs(p, exist_ok=True)
            splash_bg.save(os.path.join(p, "splash.png"), "PNG")
        print("✅ Guardados launcher icons y splash screens en Android")

if __name__ == "__main__":
    main()
