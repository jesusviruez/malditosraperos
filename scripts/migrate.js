const admin = require('firebase-admin');
const axios = require('axios');

// Inicializar Firebase usando las credenciales inyectadas por GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateAlbums() {
    console.log('Iniciando migración de álbumes...');
    const snapshot = await db.collection('albums').get();
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const spotifyUrl = data.spotifyUrl; 

        // Si tiene Spotify y todavía no tiene Apple Music procesado
        if (spotifyUrl && !data.appleMusicUrl) {
            try {
                const encodedUrl = encodeURIComponent(spotifyUrl);
                const response = await axios.get(`https://api.song.link/v1-alpha.1/links?url=${encodedUrl}`);
                const linksByPlatform = response.data.linksByPlatform;

                const appleMusicUrl = linksByPlatform.appleMusic?.url || null;
                const tidalUrl = linksByPlatform.tidal?.url || null;
                const amazonMusicUrl = linksByPlatform.amazonMusic?.url || null;

                await db.collection('albums').doc(doc.id).update({
                    appleMusicUrl: appleMusicUrl,
                    tidalUrl: tidalUrl,
                    amazonMusicUrl: amazonMusicUrl
                });

                console.log(`Actualizado con éxito: ${doc.id}`);
            } catch (error) {
                console.error(`Error en el álbum ${doc.id}:`, error.message);
            }
            
            // Pausa de medio segundo para no saturar la API gratuita de Odesli
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    console.log('¡Migración finalizada con éxito!');
}

migrateAlbums();
