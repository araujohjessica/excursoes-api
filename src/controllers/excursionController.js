import * as Excursion from "../models/excursionModel.js";

export function listPublic(req, res) {
  res.json(Excursion.listExcursions({ onlyActive: true }));
}

export function listAll(req, res) {
  res.json(Excursion.listExcursions({ onlyActive: false }));
}

export function getBySlug(req, res) {
  const exc = Excursion.findExcursionBySlug(req.params.slug);
  if (!exc || !exc.active) return res.status(404).json({ message: "Excursão não encontrada" });
  res.json(exc);
}

export function create(req, res) {
  res.status(201).json(Excursion.createExcursion(req.body));
}

export function update(req, res) {
  const existing = Excursion.findExcursionById(req.params.id);
  if (!existing) return res.status(404).json({ message: "Excursão não encontrada" });
  if (req.body.maxSpots !== undefined && req.body.maxSpots < existing.bookedSpots) {
    return res.status(400).json({ message: `Já existem ${existing.bookedSpots} vagas reservadas` });
  }
  res.json(Excursion.updateExcursion(req.params.id, req.body));
}

export function remove(req, res) {
  if (!Excursion.deleteExcursion(req.params.id)) return res.status(404).json({ message: "Excursão não encontrada" });
  res.status(204).end();
}
