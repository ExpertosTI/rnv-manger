#!/usr/bin/env node
/**
 * RNV Manager -> RENACE Portal Auto-Sync Script
 * Sincroniza el catálogo de servicios e instancias Odoo desde RNV Manager hacia la API de RENACE.TECH
 */

const fs = require('fs');
const path = require('path');

const PORTAL_API_URL = process.env.RENACE_PORTAL_URL || 'https://sistema.renace.tech/api/rnv/sync';
const ADMIN_SECRET = process.env.ADMIN_TOKEN || 'renace-admin-secret-2026';

async function syncInstances() {
  console.log('🔄 Iniciando sincronización de instancias RNV Manager -> RENACE Portal...');

  // Intentar cargar desde el archivo de respaldo más reciente si existe
  const backupPath = path.join(__dirname, '../../www.renace.tech/rnv_manager_backup_2026-03-14-16-42-11.json');
  let rawInstances = [];

  if (fs.existsSync(backupPath)) {
    try {
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      if (backupData.data && Array.isArray(backupData.data.clients)) {
        rawInstances = backupData.data.clients.map((client, idx) => ({
          service_code: String(101 + idx),
          client_name: client.name || client.companyName || `Cliente ${101 + idx}`,
          odoo_url: client.odooData?.url || `https://${(client.name || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '')}.renace.tech`,
          odoo_db: client.odooData?.db || 'db',
          active: client.isActive !== undefined ? client.isActive : true
        }));
      }
    } catch (err) {
      console.warn('⚠️ No se pudo leer el archivo de respaldo RNV:', err.message);
    }
  }

  // Si no hay instancias en el backup, usar conjunto por defecto de prueba
  if (!rawInstances.length) {
    rawInstances = [
      { service_code: '101', client_name: 'Mojo Fashion', odoo_url: 'https://mojofashion.renace.tech', odoo_db: 'db', active: true },
      { service_code: '102', client_name: 'MVP Flow Boutique', odoo_url: 'https://mvpflow.renace.tech', odoo_db: 'db', active: true },
      { service_code: '103', client_name: 'Alexandes Reyes', odoo_url: 'https://alexandes.renace.tech', odoo_db: 'db', active: true }
    ];
  }

  console.log(`📦 Instancias a sincronizar (${rawInstances.length}):`, rawInstances.map(i => `[${i.service_code}] ${i.client_name}`));

  try {
    const res = await fetch(PORTAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rnv-api-key': ADMIN_SECRET
      },
      body: JSON.stringify({ instances: rawInstances })
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      console.log(`✅ Sincronización exitosa. ${data.count} instancias procesadas en el portal de RENACE.TECH.`);
    } else {
      console.error('❌ Error devuelto por la API del portal:', data.error || data);
    }
  } catch (err) {
    console.error('❌ Error de conexión al sincronizar con el portal:', err.message);
  }
}

syncInstances();
