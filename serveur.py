#!/usr/bin/env python3
"""
Petit serveur local pour tester le site, sans la lenteur du "python3 -m http.server"
classique (qui fait une recherche DNS inversée sur chaque requête et sert les
requêtes une par une). Ici : pas de lookup DNS, et plusieurs requêtes traitées
en parallèle.

Utilisation : depuis le dossier du site (celui qui contient index.html),
    python3 serveur.py
puis ouvrir dans Safari : http://127.0.0.1:8000/index.html
"""
import http.server
import socketserver

PORT = 8000

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def address_string(self):
        # Court-circuite la résolution DNS inversée (très lente sur certains réseaux/iPad)
        return self.client_address[0]

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    with ThreadingHTTPServer(("0.0.0.0", PORT), QuietHandler) as httpd:
        print(f"Serveur démarré : http://127.0.0.1:{PORT}/index.html  (Ctrl+C pour arrêter)")
        httpd.serve_forever()
