
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
from bs4 import BeautifulSoup
import re

app = FastAPI(title="Malditos Raperos Metadata Scraper")

# Permite que tu web de administración (aunque esté en local o en otro hosting) consulte este microservicio
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def scraping_inverso_google(url_portada: str):
    """
    Intenta buscar en Google páginas de Spotify que contengan esta portada.
    """
    # Buscamos en Google el enlace directo de la imagen para ver qué páginas indexadas lo usan
    search_url = f"https://www.google.com/search?q=site:open.spotify.com+{url_portada}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(search_url, headers=headers)
    if response.status_color != 200:
        return None
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Buscamos enlaces que apunten a álbumes de Spotify
    for link in soup.find_all('a', href=True):
        href = link['href']
        match = re.search(r'https://open\.spotify\.com/album/[a-zA-Z0-9]+', href)
        if match:
            return match.group(0)
    return None

def extraer_de_spotify(spotify_url: str):
    """
    Raspa la página pública del álbum de Spotify para sacar el título, artista y año
    sin necesidad de usar credenciales ni tokens de API.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9" # Forzamos idioma español para los meses
    }
    response = requests.get(spotify_url, headers=headers)
    if response.status_code != 200:
        return None
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Spotify guarda los metadatos en etiquetas <meta> de tipo OpenGraph
    title_meta = soup.find("meta", property="og:title")
    title_text = title_meta["content"] if title_meta else ""
    
    # El og:title de Spotify suele ser: "Nombre del Álbum - Álbum de NombreArtista" o similar
    # Vamos a refinarlo buscando las etiquetas específicas del HTML si están disponibles
    try:
        title = soup.find("h1").text.strip()
    except:
        title = title_text.split(" - ")[0] if title_text else "Álbum Desconocido"
        
    try:
        # El artista suele estar en un enlace con la propiedad correspondiente o en el título
        artist_element = soup.find("a", href=re.compile(r"/artist/"))
        author = artist_element.text.strip() if artist_element else title_text.split(" de ")[1]
    except:
        author = "Artista Desconocido"

    # Intentamos buscar el año/fecha en el texto de la página
    # Las páginas de Spotify suelen decir "• 2026 • 12 canciones" o "2024"
    year = "2026"  # Por defecto por si falla
    month = "01"
    
    page_text = soup.get_text()
    years_found = re.findall(r'\b(202[0-6]|201[0-9]|200[0-9]|199[0-9])\b', page_text)
    if years_found:
        year = years_found[0] # Nos quedamos con el primer año que coincida razonablemente

    # Diccionario rápido de meses en texto a número
    meses_map = {"enero": "01", "febrero": "02", "marzo": "03", "abril": "04", "mayo": "05", "junio": "06", 
                 "julio": "07", "agosto": "08", "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"}
    
    for mes_nombre, mes_num in meses_map.items():
        if mes_nombre in page_text.lower():
            month = mes_num
            break

    return {
        "author": author,
        "title": title,
        "link": spotify_url,
        "year": year,
        "month": month
    }

@app.get("/scrape")
def get_metadata(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="Falta el parámetro 'url'")
    
    # SI EL USUARIO PEGA DIRECTAMENTE UN LINK DE SPOTIFY:
    if "open.spotify.com/album/" in url:
        spotify_link = url
    else:
        # SI PEGA LA URL DE LA IMAGEN (GOOGLEUSERCONTENT):
        spotify_link = scraping_inverso_google(url)
    
    # Si no es un link directo y la búsqueda inversa falló
    if not spotify_link:
        return {
            "author": "",
            "title": "",
            "link": "",
            "year": "2026",
            "month": "01",
            "note": "No se pudo identificar la portada automáticamente. Introduce los datos a mano."
        }
        
    # Extraer la información limpia desde la página de Spotify
    metadata = extraer_de_spotify(spotify_link)
    if not metadata:
         raise HTTPException(status_code=500, detail="No se pudo extraer la info de Spotify")
         
    return metadata
