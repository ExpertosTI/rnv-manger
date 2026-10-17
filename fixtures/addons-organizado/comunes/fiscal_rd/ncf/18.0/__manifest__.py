# -*- coding: utf-8 -*-
{
    "name": "NCF República Dominicana",
    "version": "18.0.1.2.0",
    "summary": "Comprobantes fiscales NCF para facturación",
    "description": """
Módulo fiscal de RENACE para emitir NCF en Odoo 18.
""",
    "author": "RENACE",
    "depends": ["account", "point_of_sale"],
    "data": [
        "security/ir.model.access.csv",
        "views/ncf_views.xml",
    ],
    "license": "LGPL-3",
}
