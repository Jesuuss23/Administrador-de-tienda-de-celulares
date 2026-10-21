package com.celucanje.tradein.service;

import com.celucanje.tradein.dto.TradeInPhotoDtos;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import java.sql.ResultSet;
import java.sql.SQLException;

import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TradeInPhotoService {

    private static final long MAX_BYTES = 6L * 1024 * 1024;
    private static final long MAX_PIXELS = 12_000_000L;

    private final JdbcTemplate jdbc;

    public TradeInPhotoService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<TradeInPhotoDtos.Item> getMine(
            String email,
            UUID tradeInId
    ) {
        requireOwnership(email, tradeInId);

        return jdbc.query(
                """
                SELECT id, angle, width, height, updated_at
                FROM trade_in_photos
                WHERE trade_in_id = ?
                ORDER BY CASE angle
                    WHEN 'FRONT' THEN 1
                    WHEN 'BACK' THEN 2
                    WHEN 'LEFT' THEN 3
                    WHEN 'RIGHT' THEN 4
                END
                """,
                (rs, rowNumber) -> mapItem(rs, tradeInId),
                tradeInId
        );
    }

    @Transactional(readOnly = true)
    public byte[] getContent(
            String email,
            UUID tradeInId,
            UUID photoId
    ) {
        List<byte[]> results = jdbc.query(
                """
                SELECT p.image_data
                FROM trade_in_photos p
                JOIN trade_in_requests t ON t.id = p.trade_in_id
                JOIN users u ON u.id = t.customer_id
                WHERE p.id = ?
                  AND t.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                """,
                (rs, rowNumber) -> rs.getBytes("image_data"),
                photoId,
                tradeInId,
                email
        );

        if (results.isEmpty()) {
            throw notFound();
        }

        return results.getFirst();
    }

    @Transactional
    public TradeInPhotoDtos.Item upload(
            String email,
            UUID tradeInId,
            TradeInPhotoDtos.Angle angle,
            MultipartFile file
    ) {
        /*
         * El bloqueo de la solicitud evita reemplazar fotos
         * simultáneamente con un cambio a revisión.
         */
        List<RequestContext> requests = jdbc.query(
                """
                SELECT t.status, t.customer_id
                FROM trade_in_requests t
                JOIN users u ON u.id = t.customer_id
                WHERE t.id = ?
                  AND u.email = ?
                  AND u.enabled = TRUE
                FOR UPDATE OF t
                """,
                (rs, rowNumber) -> new RequestContext(
                        rs.getString("status"),
                        rs.getObject("customer_id", UUID.class)
                ),
                tradeInId,
                email
        );

        if (requests.isEmpty()) {
            throw notFound();
        }

        RequestContext request = requests.getFirst();

        if (!"SUBMITTED".equals(request.status())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Las fotos solo pueden modificarse "
                    + "mientras la solicitud está enviada"
            );
        }

        NormalizedImage image = normalize(file);

        UUID photoId = jdbc.queryForObject(
                """
                INSERT INTO trade_in_photos (
                    trade_in_id,
                    angle,
                    image_data,
                    width,
                    height,
                    uploaded_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (trade_in_id, angle)
                DO UPDATE SET
                    image_data = EXCLUDED.image_data,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    uploaded_by = EXCLUDED.uploaded_by,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
                """,
                UUID.class,
                tradeInId,
                angle.name(),
                image.bytes(),
                image.width(),
                image.height(),
                request.customerId()
        );

        jdbc.update(
                """
                INSERT INTO audit_events (
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    details
                )
                VALUES (
                    ?,
                    'TRADE_IN_PHOTO_SAVED',
                    'TRADE_IN_REQUEST',
                    ?,
                    jsonb_build_object(
                        'photoId', CAST(? AS text),
                        'angle', CAST(? AS text)
                    )
                )
                """,
                request.customerId(),
                tradeInId,
                photoId.toString(),
                angle.name()
        );

        return jdbc.queryForObject(
                """
                SELECT id, angle, width, height, updated_at
                FROM trade_in_photos
                WHERE id = ?
                """,
                (rs, rowNumber) -> mapItem(rs, tradeInId),
                photoId
        );
    }

    private NormalizedImage normalize(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw badRequest("Selecciona una imagen");
        }

        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "La imagen no puede superar los 6 MB"
            );
        }

        try (
                var source = file.getInputStream();
                var input = new MemoryCacheImageInputStream(source)
        ) {
            var readers = ImageIO.getImageReaders(input);

            if (!readers.hasNext()) {
                throw badRequest("El archivo no es una imagen válida");
            }

            var reader = readers.next();

            try {
                String format = reader.getFormatName();

                if (!"JPEG".equalsIgnoreCase(format)
                        && !"JPG".equalsIgnoreCase(format)
                        && !"PNG".equalsIgnoreCase(format)) {
                    throw badRequest("Solo se permiten imágenes JPEG o PNG");
                }

                reader.setInput(input, true, true);

                int width = reader.getWidth(0);
                int height = reader.getHeight(0);

                if (width < 320 || height < 320
                        || width > 6000 || height > 6000
                        || (long) width * height > MAX_PIXELS) {
                    throw badRequest(
                            "La imagen debe medir al menos 320 × 320, "
                            + "no superar 6000 píxeles por lado "
                            + "ni 12 millones de píxeles en total"
                    );
                }

                BufferedImage original = reader.read(0);

                if (original == null) {
                    throw badRequest("No se pudo leer la imagen");
                }

                BufferedImage normalized = new BufferedImage(
                        width,
                        height,
                        BufferedImage.TYPE_INT_RGB
                );

                try {
                    Graphics2D graphics = normalized.createGraphics();

                    try {
                        graphics.setColor(Color.WHITE);
                        graphics.fillRect(0, 0, width, height);
                        graphics.drawImage(original, 0, 0, null);
                    } finally {
                        graphics.dispose();
                    }

                    try (var output = new ByteArrayOutputStream()) {
                        boolean written = ImageIO.write(
                                normalized,
                                "JPEG",
                                output
                        );

                        if (!written) {
                            throw new IllegalStateException(
                                    "No hay un codificador JPEG disponible"
                            );
                        }

                        byte[] bytes = output.toByteArray();

                        if (bytes.length > MAX_BYTES) {
                            throw badRequest(
                                    "La imagen procesada supera los 6 MB. "
                                    + "Reduce su resolución."
                            );
                        }

                        return new NormalizedImage(
                                bytes,
                                width,
                                height
                        );
                    }
                } finally {
                    original.flush();
                    normalized.flush();
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw badRequest(
                    "No pudimos leer la imagen. Prueba con otro JPEG o PNG."
            );
        }
    }

    private void requireOwnership(String email, UUID tradeInId) {
        Boolean ownsRequest = jdbc.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM trade_in_requests t
                    JOIN users u ON u.id = t.customer_id
                    WHERE t.id = ?
                      AND u.email = ?
                      AND u.enabled = TRUE
                )
                """,
                Boolean.class,
                tradeInId,
                email
        );

        if (!Boolean.TRUE.equals(ownsRequest)) {
            throw notFound();
        }
    }

    private TradeInPhotoDtos.Item mapItem(
            ResultSet rs,
            UUID tradeInId
    ) throws SQLException {
        UUID photoId = rs.getObject("id", UUID.class);

        return new TradeInPhotoDtos.Item(
                photoId,
                TradeInPhotoDtos.Angle.valueOf(rs.getString("angle")),
                rs.getInt("width"),
                rs.getInt("height"),
                rs.getTimestamp("updated_at").toInstant(),
                "/api/v1/trade-ins/" + tradeInId
                        + "/photos/" + photoId + "/content"
        );
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "La solicitud o la fotografía no existe"
        );
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }

    private record RequestContext(
            String status,
            UUID customerId
    ) {
    }

    private record NormalizedImage(
            byte[] bytes,
            int width,
            int height
    ) {
    }
}